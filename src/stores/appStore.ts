import { batch, createEffect, createRoot } from "solid-js";
import { createStore, reconcile, type Store } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  resolveChannelResync,
  resolveEndOfLife,
  resolveUpdateDecision,
} from "@src/utils/updateAvailability.ts";
import {
  getToolkitInfo,
  TOOLKIT_MISSING,
  TOOLKIT_TOO_OLD,
} from "@src/services/toolkit.ts";

import {
  type BalanceResponse,
  BalanceResponseSchema,
  type Connection,
  connectionDestination,
  type Destination,
  type DestinationState,
  type Disconnecting,
  IN_USE_BY_OTHER_USER_ERROR,
  type ProbeView,
  type RunMode,
  SERVICE_NOT_RUNNING_ERROR,
  type ServiceInfo,
  ServiceInfoSchema,
  type StatusResponse,
  StatusResponseSchema,
  VPNService,
  warmupProgress,
} from "@src/services/vpnService.ts";
import {
  createDestinationMode,
  type DestinationMode,
  type DestinationModeHandle,
  effectiveActive,
  type ModeAppState,
} from "@src/stores/destinationMode.ts";
import {
  IDLE_SCHEDULE,
  nextQuickProbe,
  quickProbeAnswered,
} from "@src/stores/quickProbeScheduler.ts";
import {
  logError,
  logInfo,
  logMessage as log,
  logStatus,
  logWarn,
} from "@src/utils/appLog.ts";
import {
  destinationLabel,
  getPreferredAvailabilityChangeMessage,
  pickStartupTarget,
  rankContext,
} from "@src/utils/destinations.ts";

import { type EndOfLife, useSettingsStore } from "@src/stores/settingsStore.ts";
import { deriveVPNStatus } from "@src/utils/status.ts";
import { shortAddress } from "../utils/shortAddress.ts";
import { stepTowardsFloor } from "@src/utils/syncProgress.ts";
import {
  AppScreen,
  createScreenSelector,
  detectSyncPhase,
  MAXIMUM_DELAY_TIME,
  type SyncPhaseIndex,
} from "@src/stores/screenSelector.ts";

export { AppScreen };

/** Whether the toolkit could be used. `unknown` is "not probed yet" and nothing
 * else: a probe that ran and failed is `failed`, which the Updates tab explains. */
export type ToolkitStatus = "unknown" | "ok" | "missing" | "tooOld" | "failed";

export interface ToolkitState {
  status: ToolkitStatus;
  /** The updater's own version, when it answered. */
  version: string | null;
  /** The installed package as the updater read it from the version file. */
  packageVersion: string | null;
}

export interface AppState {
  currentScreen: AppScreen;
  serviceInfo: ServiceInfo | null;
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  connection: Connection;
  disconnecting: Disconnecting[];
  // The daemon's one probe session, which follows the active destination.
  probe: ProbeView | null;
  isLoading: boolean;
  error?: string;
  runMode: RunMode | null;
  vpnStatus: string;
  warmupStatus: string;
  syncProgress: number;
  syncRecoveryReason: string | null;
  isUpdateAvailable: boolean;
  availableVersion: string | null;
  // Set only while the stored verdict covers the installed package.
  endOfLife: EndOfLife | null;
  targetDestination: string | null;
  balance: BalanceResponse | null;
  // The installed package version everything update-facing keys off: the toolkit's
  // read of the version file, falling back to the daemon's for older installs.
  packageVersion: string | null;
  toolkit: ToolkitState;
  // The carousel's cards and active pointer — see docs/destinationMode.md
  mode: DestinationMode;
}

type AppActions = {
  initializeApp: () => Promise<void>;
  setScreen: (screen: AppScreen) => void;
  connect: (targetId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  slideCommitted: (id: string) => void;
  dragStarted: () => void;
  destinationListOpened: () => void;
  destinationListClosed: (picked: string | null) => void;
  refreshToolkit: () => Promise<void>;
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

type StatusEvent = {
  payload: { Ok: StatusResponse | null } | { Err: string };
  id: number;
  event: string;
};

type BalanceEvent = {
  payload: { Ok: BalanceResponse | null } | { Err: string };
  id: number;
  event: string;
};

function initialState(): AppState {
  return {
    availableDestinations: [],
    connection: { type: "disconnected" },
    currentScreen: AppScreen.Initialization,
    destinations: {},
    disconnecting: [],
    probe: null,
    error: undefined,
    isLoading: false,
    runMode: null,
    serviceInfo: null,
    vpnStatus: "ServiceUnavailable",
    warmupStatus: "",
    syncProgress: 0,
    syncRecoveryReason: null,
    isUpdateAvailable: false,
    availableVersion: null,
    endOfLife: null,
    targetDestination: null,
    balance: null,
    packageVersion: null,
    toolkit: { status: "unknown", version: null, packageVersion: null },
    mode: {
      entries: {},
      sequence: [],
      active: null,
      mode: { mode: "auto", pending: null },
      nextKey: 0,
      listOpen: false,
      dragging: false,
      preferredLocation: null,
      lastConnectedDestination: null,
      connectOnStartup: false,
    },
  };
}

// Phase boundaries and expected durations for sync progress estimation.
// floor/ceiling are % values; durationMs is the expected phase duration.
// Calibrated 2026-10-12 on jura-prod (fresh onboarding): safe 45s, warmup 30s, delay 97s.
const SYNC_PHASES = [
  { floor: 0, ceiling: 25, durationMs: 60_000 }, // DeployingSafe
  { floor: 25, ceiling: 40, durationMs: 45_000 }, // Warmup
  { floor: 40, ceiling: 100, durationMs: MAXIMUM_DELAY_TIME }, // Channels/peers delay
] as const;

export function createAppStore(): AppStoreTuple {
  const [state, setState] = createStore<AppState>(initialState());

  let unlistenServiceInfo: (() => void) | undefined;
  let unlistenStatusUpdate: (() => void) | undefined;
  let unlistenBalanceUpdate: (() => void) | undefined;
  let activeSyncPhase: SyncPhaseIndex | null = null;
  let syncPhaseStartTime = 0;
  let syncPhaseStartProgress = 0;
  let recovering = false;
  // Taken on the first recovering tick; a retry pauses any floor climb.
  let recoveryStart: { at: number; progress: number } | null = null;
  let syncTimer: ReturnType<typeof setInterval> | undefined;
  let catchUpTarget: number | null = null;
  let floorClimb: { at: number; from: number; floor: number } | null = null;
  let pendingScreenTransition: AppScreen | null = null;
  const selectScreen = createScreenSelector();

  const CATCH_UP_SPEED = 6.6; // % per 100ms tick, only for the final run to 100
  const TICK_INTERVAL = 100; // ms
  const CEILING_CREEP = 0.01; // % per second at a phase ceiling, so the counter never freezes

  const tickSyncProgress = () => {
    const current = state.syncProgress;
    if (catchUpTarget !== null) {
      const next = Math.min(current + CATCH_UP_SPEED, catchUpTarget);
      setState("syncProgress", next);
      if (next >= catchUpTarget) {
        catchUpTarget = null;
        if (pendingScreenTransition !== null) {
          setState("currentScreen", pendingScreenTransition);
          pendingScreenTransition = null;
          stopSyncProgress();
        }
      }
      return;
    }
    if (activeSyncPhase === null) return;
    if (recovering) {
      recoveryStart ??= { at: Date.now(), progress: current };
      const creepSeconds = Math.floor((Date.now() - recoveryStart.at) / 1000);
      setState(
        "syncProgress",
        Math.min(100, recoveryStart.progress + creepSeconds * CEILING_CREEP),
      );
      return;
    }
    if (floorClimb !== null) {
      const next = stepTowardsFloor(
        floorClimb.from,
        floorClimb.floor,
        Date.now() - floorClimb.at,
      );
      setState("syncProgress", next);
      if (next >= floorClimb.floor) {
        // The phase's own budget starts at its floor, or the estimate would leap ahead by the climb's time.
        syncPhaseStartProgress = floorClimb.floor;
        syncPhaseStartTime = Date.now();
        floorClimb = null;
      }
      return;
    }
    const phase = SYNC_PHASES[activeSyncPhase];
    const elapsed = Date.now() - syncPhaseStartTime;
    // A regression (2→1) can start above this phase's ceiling: creep from there at once.
    const startsAtCeiling = syncPhaseStartProgress >= phase.ceiling;
    const linear = syncPhaseStartProgress +
      (elapsed / phase.durationMs) * (phase.ceiling - syncPhaseStartProgress);
    const base = startsAtCeiling
      ? syncPhaseStartProgress
      : Math.min(linear, phase.ceiling);
    const creepMs = startsAtCeiling
      ? elapsed
      : Math.max(0, elapsed - phase.durationMs);
    const next = Math.min(
      100,
      base + Math.floor(creepMs / 1000) * CEILING_CREEP,
    );
    setState("syncProgress", Math.max(current, next));
  };

  // Below the phase floor (an earlier phase ended early, or sync starts mid-process), climb to it 1% per step.
  const enterSyncPhase = (next: SyncPhaseIndex | null) => {
    if (next === null || activeSyncPhase === next) return;
    logInfo(`Sync phase ${next} entered`);
    // A completed earlier sync left progress at 100.
    if (activeSyncPhase === null) setState("syncProgress", 0);
    const { floor } = SYNC_PHASES[next];
    syncPhaseStartProgress = Math.max(floor, state.syncProgress);
    floorClimb = state.syncProgress < floor
      ? { at: Date.now(), from: state.syncProgress, floor }
      : null;
    activeSyncPhase = next;
    syncPhaseStartTime = Date.now();
    // Recapture, or recovery would resume from the old phase's progress.
    recoveryStart = null;
    if (!syncTimer) {
      syncTimer = setInterval(tickSyncProgress, TICK_INTERVAL);
    }
  };

  // Animate to 100% then transition to the next screen.
  const completeSyncAndTransition = (screen: AppScreen) => {
    logInfo(`Sync complete, transitioning to ${screen} screen`);
    pendingScreenTransition = screen;
    catchUpTarget = 100;
    if (!syncTimer) {
      syncTimer = setInterval(tickSyncProgress, TICK_INTERVAL);
    }
  };

  /**
   * stops sync progress ticks
   * syncing is reset via initializeApp function if needed
   */
  const stopSyncProgress = () => {
    clearInterval(syncTimer);
    syncTimer = undefined;
    activeSyncPhase = null;
    recovering = false;
    catchUpTarget = null;
    floorClimb = null;
    pendingScreenTransition = null;
  };

  const [settings, settingsActions] = useSettingsStore();

  // destinationMode.ts snapshots settings once at creation, so wait for real hydrated values.
  let destinationMode: DestinationModeHandle | undefined;
  // A status can arrive before hydration; replay it once the handle exists.
  let pendingModeAppState: ModeAppState | undefined;

  // Creates once, then only mirrors — must never call applyStatusUpdate here, or this effect (which reads destinationMode.model) retriggers itself forever.
  createEffect(() => {
    if (!destinationMode) {
      if (!settingsActions.hydrated()) return;
      destinationMode = createDestinationMode({
        preferredLocation: settings.preferredLocation,
        lastConnectedDestination: settings.lastConnectedDestination,
        connectOnStartup: settings.connectOnStartup,
      });
      if (pendingModeAppState) {
        destinationMode.applyStatusUpdate(pendingModeAppState);
      }
    }
    batch(() =>
      setState("mode", reconcile({ ...destinationMode!.model }, { key: "key" }))
    );
  });

  const criticalError = (message: string) =>
    resetToScreen(AppScreen.Initialization, message);

  // Drops everything the daemon told us; `screen` is the one that explains why.
  const resetToScreen = (screen: AppScreen, message: string) => {
    // status errors repeat every poll tick; log only when the message changes
    if (state.error !== message) logError(message);
    dropDaemonState(screen);
    setState("error", message);
  };

  // Somebody else's worker is a known state, not an error; nothing of theirs stays on screen.
  const showInUseByOtherUser = () => {
    if (state.vpnStatus === "InUseByOtherUser") return;
    logInfo("VPN in use by another user on this computer");
    dropDaemonState(AppScreen.Main);
    setState("vpnStatus", "InUseByOtherUser");
  };

  const dropDaemonState = (screen: AppScreen) => {
    stopSyncProgress();
    const savedServiceInfo = state.serviceInfo;
    // The toolkit probe does not go through the daemon (it reads the version
    // file itself), so a daemon error says nothing about its result: keep it.
    const savedToolkit = { ...state.toolkit };
    const savedPackageVersion = state.packageVersion;
    // One reconcile, so App.tsx never sees an intermediate screen.
    setState(reconcile({ ...initialState(), currentScreen: screen }));
    setState("serviceInfo", savedServiceInfo);
    setState("toolkit", savedToolkit);
    setState("packageVersion", savedPackageVersion);
    destinationMode?.reset({
      preferredLocation: settings.preferredLocation,
      lastConnectedDestination: settings.lastConnectedDestination,
      connectOnStartup: settings.connectOnStartup,
    });
  };

  const processStatusResponse = (response: StatusResponse) => {
    const [screen, warmupStatus, recoveryReason] = selectScreen(response);
    const lastWarmupError = warmupProgress(response.run_mode)?.last_error;
    // The daemon retries warmup and the safe lookup; only past those screens is that fatal.
    if (
      lastWarmupError &&
      screen !== AppScreen.Synchronization &&
      screen !== AppScreen.Initialization
    ) {
      criticalError(lastWarmupError);
      return;
    }
    if (recoveryReason && state.syncRecoveryReason !== recoveryReason) {
      logError(recoveryReason);
    }
    setState("syncRecoveryReason", recoveryReason);
    if (recoveryReason && !recovering) {
      recovering = true;
      recoveryStart = null;
    } else if (!recoveryReason && recovering) {
      // The retry redoes the phase's work, so its budget restarts from here.
      recovering = false;
      // A paused climb would jump to the floor; the restarted budget covers that ground.
      floorClimb = null;
      syncPhaseStartProgress = state.syncProgress;
      syncPhaseStartTime = Date.now();
    }

    if (screen === AppScreen.Synchronization) {
      enterSyncPhase(detectSyncPhase(response));
    } else if (
      state.currentScreen === AppScreen.Synchronization &&
      pendingScreenTransition === null
    ) {
      completeSyncAndTransition(screen);
    } else if (pendingScreenTransition === null) {
      stopSyncProgress();
    }
    const destinations = Object.fromEntries(
      response.destinations.map((ds) => [ds.destination.id, ds]),
    );
    const availableDestinations = response.destinations.map(
      (ds) => ds.destination,
    );
    logStateChange(response, destinations);
    logPrefMsg(availableDestinations);
    logStatus(response);
    setState("error", undefined);
    if (pendingScreenTransition === null) {
      setState("currentScreen", screen);
    }
    setState("warmupStatus", warmupStatus);
    setState("runMode", reconcile(response.run_mode));
    setState("destinations", reconcile(destinations));
    setState("targetDestination", response.target);
    setState("connection", reconcile(response.connection));
    setState("disconnecting", reconcile(response.disconnecting));
    setState("probe", reconcile(response.probe));
    setState("vpnStatus", deriveVPNStatus(response));
    setState("availableDestinations", availableDestinations);

    pendingModeAppState = {
      availableDestinations,
      destinations,
      connection: response.connection,
      probe: response.probe,
    };
    destinationMode?.applyStatusUpdate(pendingModeAppState);
    maybeConnectOnStartup(pendingModeAppState);
    reconcileProbe(pendingModeAppState);
    runQuickProbes(pendingModeAppState);
  };

  // Retry cadence when the daemon could not open the probe yet, e.g. its edge client is still starting.
  const PROBE_RETRY_MS = 5_000;
  let lastProbe: { id: string; at: number } | null = null;

  /** The probe follows the active destination; while live the connection already holds it. */
  const ensureProbe = (id: string, now: number) => {
    const sameRecently = lastProbe?.id === id &&
      now - lastProbe.at < PROBE_RETRY_MS;
    if (sameRecently) return;
    lastProbe = { id, at: now };
    VPNService.probe(id)
      .then((response) => logInfo(`Probe ${id}: ${response.type}`))
      .catch((error) => logWarn(`Probe ${id} failed: ${error}`));
  };

  const probeTarget = (): string | null => {
    const mode = destinationMode?.model;
    if (!mode || mode.mode.mode === "live") return null;
    return effectiveActive(mode, Date.now());
  };

  createEffect(() => {
    // Tracks the mirrored mode so a slide, a pick or an auto commit re-points the probe.
    effectiveActive(state.mode, Date.now());
    const id = probeTarget();
    if (id !== null) ensureProbe(id, Date.now());
  });

  /** A status whose probe is elsewhere means the daemon lost or refused ours: ask again. */
  const reconcileProbe = (status: ModeAppState) => {
    const id = probeTarget();
    if (id === null || status.probe?.destination === id) return;
    ensureProbe(id, Date.now());
  };

  let quickProbes = IDLE_SCHEDULE;

  /** One quick probe at a time while the list is open; see docs/destinationMode.md, Probing. */
  const runQuickProbes = (status: ModeAppState) => {
    if (!destinationMode?.model.listOpen) return;
    const now = Date.now();
    const activeId = effectiveActive(destinationMode.model, now);
    const next = nextQuickProbe(quickProbes, status, activeId, now);
    quickProbes = next.schedule;
    if (next.issue === null) return;
    const id = next.issue;
    VPNService.quickProbe(id)
      .then((response) => {
        const accepted = response.type === "checking";
        quickProbes = quickProbeAnswered(quickProbes, id, accepted);
        if (!accepted) logInfo(`Quick probe ${id}: ${response.type}`);
      })
      .catch((error) => {
        quickProbes = quickProbeAnswered(quickProbes, id, false);
        logWarn(`Quick probe ${id} failed: ${error}`);
      });
  };

  // One shot per launch, like preferredLocation: spent once a session is live or something is ready to connect.
  let startupConnectDone = false;
  const maybeConnectOnStartup = (status: ModeAppState) => {
    if (startupConnectDone || !settingsActions.hydrated()) return;
    if (!settings.connectOnStartup) {
      startupConnectDone = true;
      return;
    }
    const sessionLive = connectionDestination(status.connection) !== null;
    if (sessionLive) {
      startupConnectDone = true;
      return;
    }
    const target = pickStartupTarget(
      status.destinations,
      settings.preferredLocation,
      settings.lastConnectedDestination,
      rankContext(status),
    );
    if (target === null) return;
    startupConnectDone = true;
    log("Connect on startup");
    void actions.connect(target);
  };

  const logStateChange = (
    response: StatusResponse,
    destinations: Record<string, DestinationState>,
  ) => {
    const display = (id: string): string => {
      const dest = destinations[id]?.destination;
      const label = dest ? destinationLabel(dest) : id;
      const short = dest ? shortAddress(dest.address) : "";
      return short ? `${label} - ${short}` : label;
    };
    const prev = state.connection;
    const next = response.connection;
    const destinationChanged =
      connectionDestination(prev) !== connectionDestination(next);
    const typeChanged = prev.type !== next.type;
    const prevPhase = "phase" in prev ? prev.phase : null;

    if (next.type === "connecting") {
      const phaseChanged = typeChanged || prevPhase !== next.phase;
      if (destinationChanged || phaseChanged) {
        log(`Connecting: ${display(next.destination)} - ${next.phase}`);
      }
    }

    // Phase-less reconnects (waiting on route health) are logged by appLog's logStatus.
    if (next.type === "reconnecting" && next.phase) {
      const phaseChanged = typeChanged || prevPhase !== next.phase;
      if (destinationChanged || phaseChanged) {
        log(`Reconnecting: ${display(next.destination)} - ${next.phase}`);
      }
    }

    const newlyConnected = next.type === "connected" &&
      (typeChanged || destinationChanged);
    if (newlyConnected) {
      log(`Connected: ${display(next.destination)}`);
    }

    const prevDisconnectingMap = new Map(
      state.disconnecting.map((d) => [d.destination, d.phase]),
    );
    for (const d of response.disconnecting) {
      const prevPhase = prevDisconnectingMap.get(d.destination);
      if (prevPhase === undefined || prevPhase !== d.phase) {
        log(`Disconnecting: ${display(d.destination)} - ${d.phase}`);
      }
    }
  };

  const logPrefMsg = (availableDestinations: Destination[]) => {
    const prefMsg = getPreferredAvailabilityChangeMessage(
      state.availableDestinations,
      availableDestinations,
      settings.preferredLocation,
    );
    if (prefMsg) log(prefMsg);
  };

  // Asks the toolkit for its version and the package's. Failing is a state the
  // Updates tab explains, never an error screen. One probe at a time.
  let toolkitProbe: Promise<void> | undefined;
  const refreshToolkit = (): Promise<void> => {
    if (toolkitProbe) return toolkitProbe;
    toolkitProbe = (async () => {
      try {
        const info = await getToolkitInfo();
        setState("toolkit", {
          status: "ok",
          version: info.version,
          packageVersion: info.package_version,
        });
      } catch (e) {
        const status: ToolkitStatus = e === TOOLKIT_MISSING
          ? "missing"
          : e === TOOLKIT_TOO_OLD
          ? "tooOld"
          : "failed";
        if (status === "failed") logWarn(`Toolkit probe failed: ${e}`);
        setState("toolkit", { status, version: null, packageVersion: null });
      } finally {
        toolkitProbe = undefined;
      }
    })();
    return toolkitProbe;
  };

  const actions = {
    initializeApp: async () => {
      stopSyncProgress();
      setState("syncProgress", 0);
      // Independent of the daemon: the toolkit reads the version file itself,
      // so the package version is known even when the daemon is down.
      void refreshToolkit();
      if (unlistenServiceInfo) {
        unlistenServiceInfo();
        unlistenServiceInfo = undefined;
      }
      if (unlistenStatusUpdate) {
        unlistenStatusUpdate();
        unlistenStatusUpdate = undefined;
      }
      if (unlistenBalanceUpdate) {
        unlistenBalanceUpdate();
        unlistenBalanceUpdate = undefined;
      }

      try {
        unlistenServiceInfo = await listen<unknown>("service_info", (event) => {
          const parsed = ServiceInfoSchema.safeParse(
            (event as { payload: unknown }).payload,
          );
          if (parsed.success) {
            setState("serviceInfo", parsed.data);
          } else {
            const issues = parsed.error.issues
              .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
              .join("; ");
            criticalError(`Invalid service_info event: ${issues}`);
          }
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        criticalError("Failed to listen for service_info updates: " + errorMsg);
      }

      const listenCb = (event: unknown) => {
        // Installed but not started: its own screen, not the critical one.
        if (isServiceNotRunning(event as StatusEvent)) {
          resetToScreen(
            AppScreen.ServiceNotRunning,
            "Gnosis VPN service is not running",
          );
          return;
        }
        if (isInUseByOtherUser(event as StatusEvent)) {
          showInUseByOtherUser();
          return;
        }
        let statusResp: StatusResponse | void;
        try {
          statusResp = incomingStatusEvent(event as StatusEvent);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          criticalError("Error processing status update: " + errorMsg);
          return;
        }

        if (!statusResp) {
          criticalError("Received empty status response");
          return;
        }

        processStatusResponse(statusResp);
      };

      try {
        unlistenStatusUpdate = await listen<Promise<StatusResponse | null>>(
          "status",
          listenCb,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        criticalError("Failed to listen for status updates: " + errorMsg);
        return;
      }

      const balanceListenCb = (event: unknown) => {
        const balEvent = event as BalanceEvent;
        if ("Ok" in balEvent.payload) {
          const parsed = balEvent.payload.Ok === null
            ? null
            : BalanceResponseSchema.safeParse(balEvent.payload.Ok);
          if (parsed === null) {
            // Transient daemon hiccup (Balance(Err) / WorkerOffline tick):
            // keep the last-known balance instead of dropping the UI back to
            // the issue-only fallback. criticalError still resets everything.
          } else if (parsed && parsed.success) {
            setState("balance", parsed.data);
          } else if (parsed) {
            const issues = parsed.error.issues
              .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
              .join("; ");
            criticalError(`Invalid balance response: ${issues}`);
          }
        } else {
          // backend already persists balance failures; devtools only
          console.error("Balance polling error", balEvent.payload.Err);
        }
      };

      try {
        unlistenBalanceUpdate = await listen<unknown>(
          "balance",
          balanceListenCb,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logError("Failed to listen for balance updates: " + errorMsg);
      }

      try {
        const cached = await invoke<{
          status: { Ok: StatusResponse } | { Err: string };
          balance: { Ok: BalanceResponse } | { Err: string };
          service_info: unknown;
        }>("get_cached_state");

        try {
          listenCb({ payload: cached.status, id: -1, event: "status" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          criticalError("Failed to hydrate status: " + msg);
        }
        try {
          balanceListenCb({
            payload: cached.balance,
            id: -1,
            event: "balance",
          });
        } catch (err) {
          logWarn(`Failed to hydrate balance: ${err}`);
        }
        if (cached.service_info) {
          const parsed = ServiceInfoSchema.safeParse(cached.service_info);
          if (parsed.success) {
            setState("serviceInfo", parsed.data);
          } else {
            const issues = parsed.error.issues
              .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
              .join("; ");
            criticalError(`Invalid service_info cache: ${issues}`);
          }
        }
      } catch (err) {
        logWarn(`get_cached_state unavailable: ${err}`);
      }
    },

    setScreen: (screen: AppScreen) => setState("currentScreen", screen),

    connect: async (targetId: string) => {
      setState("isLoading", true);
      // only for the log line — connecting to an unknown destination is a service-wide no-op
      const selected = state.availableDestinations.find(
        (d) => d.id === targetId,
      );
      if (selected) {
        const name = destinationLabel(selected);
        const short = shortAddress(selected.address);
        log(`Connecting to ${name} - ${short}`);
      }

      destinationMode?.applyUserInput({ type: "connectIssued", id: targetId });
      try {
        await VPNService.connect(targetId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(message);
        setState("error", message);
        setState("isLoading", false);
        return;
      }
      setState("isLoading", false);

      // best-effort — losing this only affects which destination auto-reconnect tries next
      try {
        await settingsActions.setLastConnectedDestination(targetId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to persist last connected destination: ${message}`);
      }
    },

    disconnect: async () => {
      setState("isLoading", true);
      try {
        await VPNService.disconnect();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(message);
        setState("error", message);
      } finally {
        setState("isLoading", false);
      }
    },

    slideCommitted: (id: string) =>
      destinationMode?.applyUserInput({ type: "slideCommitted", id }),
    dragStarted: () => destinationMode?.applyUserInput({ type: "dragStarted" }),
    destinationListOpened: () => {
      destinationMode?.applyUserInput({ type: "listOpened" });
      VPNService.setStatusPollFast(true).catch((error) => logWarn(`${error}`));
      if (pendingModeAppState) runQuickProbes(pendingModeAppState);
    },
    destinationListClosed: (picked: string | null) => {
      destinationMode?.applyUserInput({ type: "listClosed", picked });
      VPNService.setStatusPollFast(false).catch((error) => logWarn(`${error}`));
      quickProbes = IDLE_SCHEDULE;
    },
    refreshToolkit,
  } as const;

  // Re-probe whenever the daemon reports its package: a completed install
  // restarts the daemon, and that is the moment the version file has moved.
  createEffect(() => {
    if (!state.serviceInfo?.package_version) return;
    void refreshToolkit();
  });

  // The toolkit's reading of the version file wins; the daemon read the same
  // file and covers installs without the toolkit.
  createEffect((previous: string | undefined) => {
    const fromToolkit = state.toolkit.packageVersion;
    const resolved = fromToolkit ?? state.serviceInfo?.package_version ?? null;
    setState("packageVersion", resolved);
    // Everything update-facing keys off this, so a shared log must name it and
    // say which source won.
    const line = resolved
      ? `Package version ${resolved} (from ${
        fromToolkit ? "toolkit" : "daemon"
      })`
      : "Package version unknown: neither toolkit nor daemon reported one";
    if (line !== previous) logInfo(line);
    return line;
  });

  // Keep the persisted channel preference and install marker in step with the
  // installed package.
  createEffect(() => {
    if (!settingsActions.hydrated()) return; // avoid clobbering stored prefs with defaults
    const pkg = state.packageVersion;
    if (!pkg) return;
    const channel = resolveChannelResync({
      packageVersion: pkg,
      channel: settings.channel,
    });
    if (pkg === settings.installedVersion && !channel) return;
    void settingsActions.syncInstalledVersion(pkg, channel);
  });

  createEffect(() => {
    const d = resolveUpdateDecision({
      outcome: settings.lastCheckOutcome,
      packageVersion: state.packageVersion,
      dismissedVersion: settings.dismissedUpdateVersion,
    });
    setState("availableVersion", d.release?.version ?? null);
    setState("isUpdateAvailable", d.isUpdateAvailable);
    setState(
      "endOfLife",
      resolveEndOfLife({
        outcome: settings.lastCheckOutcome,
        endOfLife: settings.lastEndOfLife,
        packageVersion: state.packageVersion,
      }),
    );
  });

  return [state, actions] as const;
}

const appStore = createRoot(() => createAppStore());

export function useAppStore(): AppStoreTuple {
  return appStore;
}

function isServiceNotRunning(event: StatusEvent): boolean {
  const payload = event.payload;
  return "Err" in payload && payload.Err === SERVICE_NOT_RUNNING_ERROR;
}

function isInUseByOtherUser(event: StatusEvent): boolean {
  const payload = event.payload;
  return "Err" in payload && payload.Err === IN_USE_BY_OTHER_USER_ERROR;
}

function incomingStatusEvent(event: StatusEvent): StatusResponse | void {
  const rawRes = event.payload;
  if ("Ok" in rawRes) {
    if (rawRes.Ok === null) {
      return;
    }
    const res = StatusResponseSchema.safeParse(rawRes.Ok);
    if (res.success) {
      return res.data;
    } else {
      const issues = res.error.issues
        .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid status response: ${issues}`);
    }
  } else {
    // the caller routes this through criticalError, which logs it
    throw new Error(rawRes.Err);
  }
}
