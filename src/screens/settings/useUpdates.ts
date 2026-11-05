import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@src/stores/appStore.ts";
import { effectiveActive } from "@src/stores/destinationMode.ts";
import {
  type UpdateChannel,
  useSettingsStore,
} from "@src/stores/settingsStore.ts";
import { checkUpdate } from "@src/services/toolkit.ts";
import {
  getInstallStatus,
  type InstallStatus,
  InstallStatusSchema,
  installUpdate,
  UPDATE_INSTALL_STATUS_EVENT,
} from "@src/services/updateInstall.ts";
import { detectChannel } from "@src/utils/version.ts";
import {
  resolveUpdateBlocker,
  resolveUpdateDecision,
  type UpdateBlocker,
} from "@src/utils/updateAvailability.ts";
import { getPlatform } from "@src/utils/platform.ts";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
import {
  clearSettingsRequest,
  settingsRequest,
} from "@src/utils/settingsPage.ts";

/** UI phases of a driven install (macOS); "installing" holds through Completed, as the installer restarts the app. */
export type InstallPhase = "downloading" | "installing";

export const INSTALL_LABELS: Record<InstallPhase, string> = {
  downloading: "Downloading…",
  installing: "Installing…",
};

function formatCheckedAt(epoch: number): string {
  const d = new Date(epoch);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${
    pad(d.getHours())
  }:${pad(d.getMinutes())}`;
}

/** Update check and install state for the Settings page; call from a component. */
export function useUpdates() {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  const [showCheckModal, setShowCheckModal] = createSignal(false);
  const [checking, setChecking] = createSignal(false);
  const [pendingConnectCheck, setPendingConnectCheck] = createSignal(false);
  const [showInstallModal, setShowInstallModal] = createSignal(false);
  const [installPhase, setInstallPhase] = createSignal<InstallPhase | null>(
    null,
  );
  const [installError, setInstallError] = createSignal<string | null>(null);
  const [showHowTo, setShowHowTo] = createSignal(false);
  const [pendingConnectInstall, setPendingConnectInstall] = createSignal(false);
  const [platform, { refetch: refetchPlatform }] = createResource(getPlatform);

  const runCheck = async (skipVpn: boolean) => {
    setChecking(true);
    try {
      const result = await checkUpdate(skipVpn);
      await settingsActions.setUpdateCheckResult(
        result.outcome,
        result.end_of_life,
        Date.now(),
      );
    } catch (e) {
      // failures are logged by the backend's check_update command
      if (e === "VpnNotConnected") {
        logInfo("Update check needs VPN, asking user how to proceed");
        setShowCheckModal(true);
      }
      // TODO: surface other errors in the UI
    } finally {
      setChecking(false);
    }
  };
  const check = () => void runCheck(false);

  // The tray's "Check update" lands here.
  createEffect(() => {
    if (settingsRequest() !== "check-update") return;
    clearSettingsRequest();
    check();
  });

  const installedChannel = createMemo<UpdateChannel | null>(() => {
    const ver = appState.packageVersion;
    return ver ? detectChannel(ver) : null;
  });

  // Installed package is authoritative; preference fills in until daemon reports a version.
  const channel = createMemo<UpdateChannel>(() =>
    installedChannel() ?? settings.channel ?? "stable"
  );

  const decision = createMemo(() =>
    resolveUpdateDecision({
      outcome: settings.lastCheckOutcome,
      packageVersion: appState.packageVersion,
      dismissedVersion: settings.dismissedUpdateVersion,
    })
  );
  const isUpToDate = () => decision().isUpToDate;

  const lastChecked = () =>
    settings.lastCheckedAt == null
      ? null
      : formatCheckedAt(settings.lastCheckedAt);

  // Install progress (macOS): the Rust `install_update` command streams the
  // updater's phases as events; the last one is queryable for re-hydration
  // after a remount mid-install.
  let completedFallback: ReturnType<typeof setTimeout> | undefined;

  const applyInstallStatus = (s: InstallStatus) => {
    switch (s.kind) {
      case "Checking":
        setInstallError(null);
        setInstallPhase("downloading");
        break;
      case "Downloading":
        setInstallPhase("downloading");
        break;
      case "Installing":
        setInstallPhase("installing");
        break;
      case "Completed":
        // The installer restarts the app, so keep "Installing…" to the end.
        // Safety nets in case the restart never happens: the effect below
        // clears the phase once the new version leaves no pending update, and
        // this fallback re-enables the button for a retry.
        setInstallPhase("installing");
        clearTimeout(completedFallback);
        completedFallback = setTimeout(() => setInstallPhase(null), 60_000);
        break;
      case "Failed":
        setInstallPhase(null);
        setInstallError(`${s.stage}: ${s.error}`);
        break;
    }
  };

  createEffect(() => {
    // The new version makes the stored verdict stale, so `undefined` counts.
    if (installPhase() === "installing" && isUpToDate() !== false) {
      clearTimeout(completedFallback);
      setInstallPhase(null);
    }
  });

  const startInstall = (force: boolean) => {
    setInstallError(null);
    // Synchronous phase set: disables the button before the invoke resolves.
    setInstallPhase("downloading");
    installUpdate(channel(), force).catch((e) => {
      if (e === "InstallInProgress") return; // already streaming events
      setInstallPhase(null);
      setInstallError(String(e));
    });
  };

  const install = async () => {
    // Don't pick an install path before the platform is known — clicking
    // right after mount must not open the Linux how-to on macOS.
    if (platform.loading) return;
    // A failed probe resolves to "unknown"; retry on click so a transient
    // failure can't pin macOS on the manual path for the mount's lifetime.
    const os = platform() === "unknown" ? await refetchPlatform() : platform();
    if (os !== "macos") {
      // Elsewhere updating is manual; show the instructions.
      setShowHowTo(true);
      return;
    }
    // macOS ships /usr/local/bin/gnosis_vpn-update; the app drives it.
    if (appState.vpnStatus === "Connected") {
      startInstall(false);
    } else {
      setShowInstallModal(true);
    }
  };

  let unlistenInstall: (() => void) | undefined;
  let disposed = false;

  onMount(() => {
    // Live events first, then catch up on a possibly running install. A
    // hydration reply can be staler than an event that raced past it, so it
    // only applies when no live event has arrived yet.
    let sawLiveInstallEvent = false;
    void listen(UPDATE_INSTALL_STATUS_EVENT, (event) => {
      const parsed = InstallStatusSchema.safeParse(event.payload);
      if (parsed.success) {
        sawLiveInstallEvent = true;
        applyInstallStatus(parsed.data);
      } else {
        logWarn(
          `Install status event schema mismatch: ${
            JSON.stringify(event.payload)
          }`,
        );
      }
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      unlistenInstall = unlisten;
      void getInstallStatus().then((status) => {
        if (!disposed && !sawLiveInstallEvent && status) {
          applyInstallStatus(status);
        }
      });
    });
  });

  onCleanup(() => {
    disposed = true;
    unlistenInstall?.();
    clearTimeout(completedFallback);
  });

  const connectActive = (): boolean => {
    const id = effectiveActive(appState.mode, Date.now());
    if (!id) return false;
    void appActions.connect(id);
    return true;
  };

  const checkAnyway = () => {
    setShowCheckModal(false);
    void runCheck(true);
  };

  const connectAndCheck = () => {
    setShowCheckModal(false);
    if (connectActive()) setPendingConnectCheck(true);
  };

  const installAnyway = () => {
    setShowInstallModal(false);
    startInstall(true);
  };

  const connectAndInstall = () => {
    setShowInstallModal(false);
    if (connectActive()) setPendingConnectInstall(true);
  };

  // After "Connect and check" / "Connect and install": act once VPN reaches Connected.
  createEffect(() => {
    if (pendingConnectCheck() && appState.vpnStatus === "Connected") {
      setPendingConnectCheck(false);
      void runCheck(false);
    }
  });
  createEffect(() => {
    if (pendingConnectInstall() && appState.vpnStatus === "Connected") {
      setPendingConnectInstall(false);
      startInstall(false);
    }
  });

  const blocker = createMemo<UpdateBlocker | null>(() =>
    resolveUpdateBlocker({
      toolkitStatus: appState.toolkit.status,
      packageVersion: appState.packageVersion,
    })
  );

  // The screen a user describes in a bug report should be readable in their log.
  createEffect((previous: string | undefined) => {
    const kind = blocker()?.kind;
    if (kind && kind !== previous) logInfo(`Updates blocked: ${kind}`);
    return kind;
  });

  const [retrying, setRetrying] = createSignal(false);
  const retryToolkit = async () => {
    setRetrying(true);
    logInfo("Retrying the update tool probe");
    try {
      await appActions.refreshToolkit();
    } finally {
      setRetrying(false);
    }
  };

  return {
    decision,
    isUpToDate,
    lastChecked,
    channel,
    checking,
    check,
    install: () => void install(),
    installPhase,
    installError,
    isMacos: () => platform() === "macos",
    blocker,
    retrying,
    retryToolkit: () => void retryToolkit(),
    showCheckModal,
    closeCheckModal: () => setShowCheckModal(false),
    checkAnyway,
    connectAndCheck,
    showInstallModal,
    closeInstallModal: () => setShowInstallModal(false),
    installAnyway,
    connectAndInstall,
    showHowTo,
    setShowHowTo,
  };
}
