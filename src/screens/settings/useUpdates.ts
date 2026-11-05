import { createEffect, createMemo, createRoot, createSignal } from "solid-js";
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
import { effectiveChannel } from "@src/utils/version.ts";
import {
  resolveUpdateBlocker,
  resolveUpdateDecision,
  type UpdateBlocker,
} from "@src/utils/updateAvailability.ts";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
import type { InstallPhase } from "@src/components/common/UpdateStatusCard.tsx";

function formatCheckedAt(epoch: number): string {
  const d = new Date(epoch);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${
    pad(d.getHours())
  }:${pad(d.getMinutes())}`;
}

function createUpdates() {
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

  const blocker = createMemo<UpdateBlocker | null>(() =>
    resolveUpdateBlocker({
      toolkitStatus: appState.toolkit.status,
      packageVersion: appState.packageVersion,
    })
  );

  // Not connected, the toolkit would refuse; ask first rather than spin through its run.
  const check = () => {
    // blocked, the page shows why and how to fix it instead
    if (blocker()) return;
    if (appState.vpnStatus === "Connected") void runCheck(false);
    else setShowCheckModal(true);
  };

  const channel = createMemo<UpdateChannel>(() =>
    effectiveChannel(appState.packageVersion, settings.channel)
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

  // macOS: install_update streams the updater's phases as events; getInstallStatus replays the last one.
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
        // the installer restarts the app; the effect below and this timeout re-enable Install if it never does
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

  // macOS only: UpdateStatusCard shows the how-to elsewhere.
  const install = () => {
    if (appState.vpnStatus === "Connected") {
      startInstall(false);
    } else {
      setShowInstallModal(true);
    }
  };

  // Live events first; the status query can be staler than an event that raced it, so it yields to one.
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
  }).then(() => getInstallStatus()).then((status) => {
    if (!sawLiveInstallEvent && status) applyInstallStatus(status);
  }).catch((e) => logWarn(`Cannot follow the update install: ${e}`));

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
    install,
    installPhase,
    installError,
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

let updates: ReturnType<typeof createUpdates> | undefined;

/** Update check and install state for the Settings pages; one instance, so a "Connect and check" outlives the page. */
export function useUpdates(): ReturnType<typeof createUpdates> {
  return updates ??= createRoot(createUpdates);
}
