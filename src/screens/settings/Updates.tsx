import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { emit, listen } from "@tauri-apps/api/event";
import brokenDeviceIcon from "@assets/icons/broken-device.svg";
import Toggle from "@src/components/common/Toggle.tsx";
import UpdateStatusCard, {
  type InstallPhase,
} from "@src/components/common/UpdateStatusCard.tsx";
import SegmentedControl from "@src/components/common/SegmentedControl.tsx";
import CheckUpdateModal from "@src/components/CheckUpdateModal.tsx";
import InstallUpdateModal from "@src/components/InstallUpdateModal.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  type UpdateChannel,
  type UpdateManifest,
  useSettingsStore,
} from "@src/stores/settingsStore.ts";
import { detectChannel } from "@src/utils/version.ts";
import { evaluateUpdate } from "@src/utils/updateAvailability.ts";
import {
  getInstallStatus,
  type InstallStatus,
  InstallStatusSchema,
  installUpdate,
  UPDATE_INSTALL_STATUS_EVENT,
} from "@src/services/updateInstall.ts";

const REVEAL_CLICKS = 7;
const REVEAL_WINDOW_MS = 2000;

const CHANNEL_OPTIONS: { value: UpdateChannel; label: string }[] = [
  { value: "stable", label: "Stable" },
  { value: "snapshot", label: "Snapshot" },
];

export default function Updates() {
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
  const [pendingConnectInstall, setPendingConnectInstall] = createSignal(false);
  const [appVersion] = createResource(() => getVersion());
  const [showVersionDetails, setShowVersionDetails] = createSignal(false);
  let versionClickCount = 0;
  let lastVersionClickAt = 0;

  const handleVersionClick = () => {
    const now = Date.now();
    versionClickCount = now - lastVersionClickAt > REVEAL_WINDOW_MS
      ? 1
      : versionClickCount + 1;
    lastVersionClickAt = now;
    if (versionClickCount >= REVEAL_CLICKS) {
      setShowVersionDetails(true);
      versionClickCount = 0;
    }
  };

  const runCheck = async (skipVpn: boolean) => {
    setChecking(true);
    try {
      const manifest = await invoke<UpdateManifest>("check_update", {
        skipVpn,
      });
      await settingsActions.setUpdateCheckResult(manifest, Date.now());
    } catch (e) {
      if (e === "VpnNotConnected") {
        setShowCheckModal(true);
      }
      // TODO: surface other errors
    } finally {
      setChecking(false);
    }
  };

  const packageVersion = createMemo(() =>
    appState.serviceInfo?.package_version ?? null
  );

  const effectiveChannel = createMemo<UpdateChannel>(() => {
    if (settings.channel) return settings.channel;
    const ver = packageVersion();
    return ver ? detectChannel(ver) : "stable";
  });

  createEffect(() => {
    if (!settings.channel && packageVersion()) {
      void settingsActions.setChannel(detectChannel(packageVersion()!));
    }
  });

  const latestVersion = createMemo(() =>
    settings.updateManifest?.channels[effectiveChannel()]?.version
  );

  const isUpToDate = createMemo<boolean | undefined>(() =>
    evaluateUpdate({
      packageVersion: packageVersion(),
      manifest: settings.updateManifest ?? null,
      channel: settings.channel,
      dismissedVersion: settings.dismissedUpdateVersion,
    }).isUpToDate
  );

  const formatCheckedAt = (epoch: number) => {
    const d = new Date(epoch);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${
      pad(d.getHours())
    }:${pad(d.getMinutes())}`;
  };

  const handleCheck = () => void runCheck(false);

  // Install progress (macOS): the Rust `install_update` command streams the
  // updater's phases as events; the last one is queryable for re-hydration
  // after a tab-switch remount mid-install.
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
        // clears the phase once the restarted daemon flips isUpToDate, and
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
    if (installPhase() === "installing" && isUpToDate() === true) {
      clearTimeout(completedFallback);
      setInstallPhase(null);
    }
  });

  const startInstall = (force: boolean) => {
    setInstallError(null);
    // Synchronous phase set: disables the button before the invoke resolves.
    setInstallPhase("downloading");
    installUpdate(effectiveChannel(), force).catch((e) => {
      if (e === "InstallInProgress") return; // already streaming events
      setInstallPhase(null);
      setInstallError(String(e));
    });
  };

  const handleInstall = () => {
    if (appState.vpnStatus === "Connected") {
      startInstall(false);
    } else {
      setShowInstallModal(true);
    }
  };

  let unlistenCheck: (() => void) | undefined;
  let unlistenPing: (() => void) | undefined;
  let unlistenInstall: (() => void) | undefined;
  let disposed = false;

  onMount(() => {
    void listen("updates:check", () => handleCheck()).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      unlistenCheck = unlisten;
      void emit("updates:ready", null);
    });
    // Respond to pings so Rust can detect a ready, already-mounted instance
    // (the onMount-time ready emit only covers fresh mounts).
    void listen("updates:ping", () => {
      void emit("updates:ready", null);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      unlistenPing = unlisten;
    });
    // Live events first, then catch up on a possibly running install. A
    // hydration reply can be staler than an event that raced past it, so it
    // only applies when no live event has arrived yet.
    let sawLiveInstallEvent = false;
    void listen(UPDATE_INSTALL_STATUS_EVENT, (event) => {
      const parsed = InstallStatusSchema.safeParse(event.payload);
      if (parsed.success) {
        sawLiveInstallEvent = true;
        applyInstallStatus(parsed.data);
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
    unlistenCheck?.();
    unlistenPing?.();
    unlistenInstall?.();
    clearTimeout(completedFallback);
  });

  const handleCheckAnyway = () => {
    setShowCheckModal(false);
    void runCheck(true);
  };

  const handleConnectAndCheck = () => {
    setShowCheckModal(false);
    setPendingConnectCheck(true);
    void appActions.connect();
  };

  // After "Connect and check": once VPN reaches Connected, fire the check.
  // Local to this window — module-level signals don't cross Tauri webviews.
  createEffect(() => {
    if (pendingConnectCheck() && appState.vpnStatus === "Connected") {
      setPendingConnectCheck(false);
      void runCheck(false);
    }
  });

  // Same for "Connect and install".
  createEffect(() => {
    if (pendingConnectInstall() && appState.vpnStatus === "Connected") {
      setPendingConnectInstall(false);
      startInstall(false);
    }
  });

  if (!appState.serviceInfo?.package_version) {
    return (
      <div class="flex flex-col items-center justify-center gap-4 w-full h-full p-6 bg-bg-primary">
        <div class="relative shrink-0 w-[120px] h-[120px]">
          <img
            src={brokenDeviceIcon}
            alt=""
            class="w-[120px] h-[120px]"
          />
        </div>
        <span class="text-base font-medium text-red-500 text-center">
          Package version not found — please reinstall
        </span>
      </div>
    );
  }

  return (
    <div class="space-y-4 w-full p-6 max-w-lg bg-bg-primary flex flex-col h-full">
      <UpdateStatusCard
        onCheck={handleCheck}
        loading={checking()}
        isUpToDate={isUpToDate()}
        latestVersion={latestVersion()}
        releaseNotes={settings.updateManifest?.channels[effectiveChannel()]
          ?.release_notes}
        lastChecked={settings.lastCheckedAt != null
          ? formatCheckedAt(settings.lastCheckedAt)
          : undefined}
        onInstall={handleInstall}
        installPhase={installPhase()}
        installError={installError()}
      />
      <CheckUpdateModal
        open={showCheckModal()}
        onClose={() => setShowCheckModal(false)}
        onCheckAnyway={handleCheckAnyway}
        onConnectAndCheck={handleConnectAndCheck}
      />
      <InstallUpdateModal
        open={showInstallModal()}
        onClose={() => setShowInstallModal(false)}
        onInstallAnyway={() => {
          setShowInstallModal(false);
          startInstall(true);
        }}
        onConnectAndInstall={() => {
          setShowInstallModal(false);
          setPendingConnectInstall(true);
          void appActions.connect();
        }}
      />
      <Toggle
        label="Automatic update check"
        checked={settings.updateCheck}
        onChange={(e) =>
          void settingsActions.setUpdateCheck(e.currentTarget.checked)}
        description="Done only when connected through the Gnosis VPN"
      />
      <SegmentedControl
        label="Update channel"
        //  description="Stable is the default, Snapshot is for testing new features"
        options={CHANNEL_OPTIONS}
        value={effectiveChannel()}
        onChange={(ch) => void settingsActions.setChannel(ch)}
        // tooltipSwitcher="When on Stable, you can't switch to Snapshot"
      />
      <div class="grow" />
      <div class="space-y-1 text-sm text-text-secondary text-center">
        <div onClick={handleVersionClick} class="cursor-default">
          Version:{" "}
          <span class="text-text-primary">
            {appState.serviceInfo?.package_version ?? "Something went wrong"}
          </span>
        </div>
        <Show when={showVersionDetails()}>
          <div class="text-xs">
            Service version:{" "}
            <span class="text-text-primary">
              {appState.serviceInfo?.version ?? "—"}
            </span>
          </div>
          <div class="text-xs">
            App version:{" "}
            <span class="text-text-primary">
              {appVersion() ?? "—"}
            </span>
          </div>
        </Show>
      </div>
    </div>
  );
}
