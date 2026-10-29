import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { emit, listen } from "@tauri-apps/api/event";
import brokenDeviceIcon from "@assets/icons/broken-device.svg";
import Toggle from "@src/components/common/Toggle.tsx";
import { Row, Section } from "@src/components/common/GroupedList.tsx";
import Banner from "@src/components/common/Banner.tsx";
import WarningIcon from "@src/components/icons/WarningIcon.tsx";
import UpdateStatusCard, {
  type InstallPhase,
} from "@src/components/common/UpdateStatusCard.tsx";
import SegmentedControlSwitcher from "@src/components/common/SegmentedControlSwitcher.tsx";
import Button from "@src/components/common/Button.tsx";
import CheckUpdateModal from "@src/components/CheckUpdateModal.tsx";
import HowToUpdateModal from "@src/components/common/HowToUpdateModal.tsx";
import InstallUpdateModal from "@src/components/InstallUpdateModal.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { effectiveActive } from "@src/stores/destinationMode.ts";
import {
  type UpdateChannel,
  useSettingsStore,
} from "@src/stores/settingsStore.ts";
import { checkUpdate } from "@src/services/toolkit.ts";
import { detectChannel } from "@src/utils/version.ts";
import { setUpdateChecking } from "@src/utils/updateChecker.ts";
import {
  endOfLifeMessage,
  resolveUpdateBlocker,
  resolveUpdateDecision,
  type UpdateBlocker,
} from "@src/utils/updateAvailability.ts";
import { createDeadlineClock } from "@src/utils/deadlineClock.ts";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
import {
  getInstallStatus,
  type InstallStatus,
  InstallStatusSchema,
  installUpdate,
  UPDATE_INSTALL_STATUS_EVENT,
} from "@src/services/updateInstall.ts";

// The switcher is read-only, so Experimental would be a segment nobody can pick.
// It appears only for the machines already running it, to show where they are.
const CHANNEL_OPTIONS: { value: UpdateChannel; label: string }[] = [
  { value: "stable", label: "Stable" },
  { value: "snapshot", label: "Snapshot" },
];
const EXPERIMENTAL_OPTION = {
  value: "experimental",
  label: "Experimental",
} as const;

/** Settings → Software update: the check, the install, and the two preferences. */
export default function SoftwareUpdatePage() {
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
    setUpdateChecking(true);
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
      setUpdateChecking(false);
    }
  };

  const packageVersion = createMemo(() => appState.packageVersion);

  const installedChannel = createMemo<UpdateChannel | null>(() => {
    const ver = packageVersion();
    return ver ? detectChannel(ver) : null;
  });

  // Installed package is authoritative; preference fills in until daemon reports a version.
  const effectiveChannel = createMemo<UpdateChannel>(() =>
    installedChannel() ?? settings.channel ?? "stable"
  );

  const channelOptions = createMemo(() =>
    effectiveChannel() === "experimental"
      ? [...CHANNEL_OPTIONS, EXPERIMENTAL_OPTION]
      : CHANNEL_OPTIONS
  );

  const decision = createMemo(() =>
    resolveUpdateDecision({
      outcome: settings.lastCheckOutcome,
      packageVersion: packageVersion(),
      dismissedVersion: settings.dismissedUpdateVersion,
    })
  );
  const isUpToDate = () => decision().isUpToDate;

  // "today 13:59" for a check from today, the date otherwise.
  const formatCheckedAt = (epoch: number) => {
    const d = new Date(epoch);
    const pad = (n: number) => String(n).padStart(2, "0");
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const today = new Date();
    const sameDay = d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    return sameDay
      ? `today ${time}`
      : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${
        pad(d.getDate())
      } ${time}`;
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
    const id = effectiveActive(appState.mode, Date.now());
    if (!id) return;
    setPendingConnectCheck(true);
    void appActions.connect(id);
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

  const blocker = createMemo<UpdateBlocker | null>(() =>
    resolveUpdateBlocker({
      toolkitStatus: appState.toolkit.status,
      packageVersion: packageVersion(),
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

  return (
    <>
      {/* Above the blocker too: it is the only place the reason is shown. */}
      <Show when={appState.endOfLife}>
        {(endOfLife) => {
          const now = createDeadlineClock(() =>
            Date.parse(endOfLife().ends_at)
          );
          return (
            <Banner variant="danger" icon={<WarningIcon />}>
              <span class="flex flex-col">
                <span>{endOfLifeMessage(endOfLife(), now())}</span>
                <Show when={endOfLife().reason.trim()}>
                  {(reason) => <span>{reason()}</span>}
                </Show>
              </span>
            </Banner>
          );
        }}
      </Show>
      <Show
        when={!blocker()}
        fallback={
          <div class="flex flex-col items-center gap-4 rounded-xl border border-border bg-bg-surface px-4 py-6">
            <img src={brokenDeviceIcon} alt="" class="size-24" />
            <span class="text-center text-sm font-medium text-text-red">
              {blocker()?.message}
            </span>
            <Show when={blocker()?.retryable}>
              <Button
                size="sm"
                variant="outline"
                fullWidth={false}
                loading={retrying()}
                onClick={() => void retryToolkit()}
              >
                Try again
              </Button>
            </Show>
            <button
              type="button"
              class="text-sm text-text-secondary underline"
              onClick={() => setShowHowTo(true)}
            >
              How to update
            </button>
            <HowToUpdateModal
              open={showHowTo()}
              onClose={() => setShowHowTo(false)}
            />
          </div>
        }
      >
        <UpdateStatusCard
          onCheck={handleCheck}
          loading={checking()}
          isUpToDate={isUpToDate()}
          latestVersion={decision().release?.version}
          releaseNotes={decision().release?.release_notes}
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
            const id = effectiveActive(appState.mode, Date.now());
            if (!id) return;
            setPendingConnectInstall(true);
            void appActions.connect(id);
          }}
        />
        <Section title="Preferences">
          <Row
            label="Check automatically"
            description="Only while connected through Gnosis VPN"
            control={
              <Toggle
                small
                aria-label="Check automatically"
                checked={settings.updateCheck}
                onChange={(e) =>
                  void settingsActions.setUpdateCheck(e.currentTarget.checked)}
              />
            }
          />
          {/* Read-only today, exactly as before: the installed package decides the channel. */}
          <Row
            label="Channel"
            control={
              <SegmentedControlSwitcher
                ariaLabel="Channel"
                options={channelOptions()}
                value={effectiveChannel()}
                onChange={(ch) => void settingsActions.setChannel(ch)}
                disabled
              />
            }
          />
        </Section>
      </Show>
    </>
  );
}
