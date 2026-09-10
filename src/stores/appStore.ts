import { batch, createEffect, createRoot } from "solid-js";
import { createStore, reconcile, type Store } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  evaluateUpdate,
  resolveChannelResync,
} from "@src/utils/updateAvailability.ts";

import {
  type BalanceResponse,
  BalanceResponseSchema,
  type ConnectedInfo,
  type ConnectingInfo,
  type Destination,
  type DestinationState,
  type DisconnectingInfo,
  isWarmupRunMode,
  type ReconnectingInfo,
  type RunMode,
  type ServiceInfo,
  ServiceInfoSchema,
  type StatusResponse,
  StatusResponseSchema,
  VPNService,
} from "@src/services/vpnService.ts";
import {
  createDestinationMode,
  type DestinationMode,
  type DestinationModeHandle,
  type ModeAppState,
} from "@src/stores/destinationMode.ts";
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
} from "@src/utils/destinations.ts";

import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { deriveVPNStatus } from "@src/utils/status.ts";
import { shortAddress } from "../utils/shortAddress.ts";
import {
  AppScreen,
  createScreenSelector,
  detectSyncPhase,
  type SyncPhaseIndex,
} from "@src/stores/screenSelector.ts";

export { AppScreen };

export interface AppState {
  currentScreen: AppScreen;
  serviceInfo: ServiceInfo | null;
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  connected: ConnectedInfo | null;
  connecting: ConnectingInfo | null;
  reconnecting: ReconnectingInfo | null;
  disconnecting: DisconnectingInfo[];
  isLoading: boolean;
  error?: string;
  runMode: RunMode | null;
  vpnStatus: string;
  warmupStatus: string;
  syncProgress: number;
  syncRecoveryDeadline: number | null;
  isUpdateAvailable: boolean;
  availableVersion: string | null;
  targetDestination: string | null;
  balance: BalanceResponse | null;
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
    connected: null,
    connecting: null,
    reconnecting: null,
    currentScreen: AppScreen.Initialization,
    destinations: {},
    disconnecting: [],
    error: undefined,
    isLoading: false,
    runMode: null,
    serviceInfo: null,
    vpnStatus: "ServiceUnavailable",
    warmupStatus: "",
    syncProgress: 0,
    syncRecoveryDeadline: null,
    isUpdateAvailable: false,
    availableVersion: null,
    targetDestination: null,
    balance: null,
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
// Adjust durationMs when real-world timing data is available.
const SYNC_PHASES = [
  { floor: 0, ceiling: 30, durationMs: 30_000 }, // DeployingSafe
  { floor: 30, ceiling: 50, durationMs: 20_000 }, // Warmup
  { floor: 50, ceiling: 100, durationMs: 50_000 }, // Channels/peers delay
] as const;

export function createAppStore(): AppStoreTuple {
  const [state, setState] = createStore<AppState>(initialState());

  let unlistenServiceInfo: (() => void) | undefined;
  let unlistenStatusUpdate: (() => void) | undefined;
  let unlistenBalanceUpdate: (() => void) | undefined;
  let activeSyncPhase: SyncPhaseIndex | null = null;
  let syncPhaseStartTime = 0;
  let syncTimer: ReturnType<typeof setInterval> | undefined;
  let catchUpTarget: number | null = null;
  let pendingScreenTransition: AppScreen | null = null;
  const selectScreen = createScreenSelector();

  const CATCH_UP_SPEED = 6.6; // % per 100ms tick
  const TICK_INTERVAL = 100; // ms

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
    const phase = SYNC_PHASES[activeSyncPhase];
    const elapsed = Date.now() - syncPhaseStartTime;
    const phaseRange = phase.ceiling - phase.floor;
    const raw = phase.floor + (elapsed / phase.durationMs) * phaseRange;
    setState("syncProgress", Math.min(raw, phase.ceiling));
  };

  // When advancing to a later phase, animate quickly to the phase boundary.
  // When entering sync for the first time mid-process, animate from 0 to the phase floor.
  const enterSyncPhase = (next: SyncPhaseIndex | null) => {
    if (next === null || activeSyncPhase === next) return;
    logInfo(`Sync phase ${next} entered`);
    if (activeSyncPhase !== null && next > activeSyncPhase) {
      catchUpTarget = SYNC_PHASES[next].floor;
    } else if (activeSyncPhase === null && next > 0) {
      catchUpTarget = SYNC_PHASES[next].floor;
    }
    activeSyncPhase = next;
    syncPhaseStartTime = Date.now();
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
    catchUpTarget = null;
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

  const criticalError = (message: string) => {
    // status errors repeat every poll tick; log only when the message changes
    if (state.error !== message) logError(message);
    stopSyncProgress();
    const savedServiceInfo = state.serviceInfo;
    setState(reconcile(initialState()));
    setState("serviceInfo", savedServiceInfo);
    setState("error", message);
    destinationMode?.reset({
      preferredLocation: settings.preferredLocation,
      lastConnectedDestination: settings.lastConnectedDestination,
      connectOnStartup: settings.connectOnStartup,
    });
  };

  const processStatusResponse = (response: StatusResponse) => {
    if (isWarmupRunMode(response.run_mode)) {
      const lastError = response.run_mode.Warmup.last_error;
      if (lastError) {
        criticalError(lastError);
        return;
      }
    }

    const [screen, warmupStatus, syncRecoveryDeadline] = selectScreen(response);
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
    setState("syncRecoveryDeadline", syncRecoveryDeadline);
    setState("runMode", reconcile(response.run_mode));
    setState("destinations", reconcile(destinations));
    setState("targetDestination", response.target_destination);
    setState("connected", response.connected);
    setState("connecting", reconcile(response.connecting));
    setState("reconnecting", reconcile(response.reconnecting));
    setState("disconnecting", reconcile(response.disconnecting));
    setState("vpnStatus", deriveVPNStatus(response));
    setState("availableDestinations", availableDestinations);

    pendingModeAppState = {
      availableDestinations,
      destinations,
      connected: response.connected,
      connecting: response.connecting,
      reconnecting: response.reconnecting,
    };
    destinationMode?.applyStatusUpdate(pendingModeAppState);
    maybeConnectOnStartup(pendingModeAppState);
  };

  // One shot per launch, like preferredLocation: spent once a session is live or something is ready to connect.
  let startupConnectDone = false;
  const maybeConnectOnStartup = (status: ModeAppState) => {
    if (startupConnectDone || !settingsActions.hydrated()) return;
    if (!settings.connectOnStartup) {
      startupConnectDone = true;
      return;
    }
    const sessionLive = status.connected !== null ||
      status.connecting !== null || status.reconnecting !== null;
    if (sessionLive) {
      startupConnectDone = true;
      return;
    }
    const target = pickStartupTarget(
      status.destinations,
      settings.preferredLocation,
      settings.lastConnectedDestination,
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
    const nextConnecting = response.connecting;
    const connectingIdChanged =
      state.connecting?.destination_id !== nextConnecting?.destination_id;
    const connectingPhaseChanged =
      state.connecting?.phase !== nextConnecting?.phase;
    if (nextConnecting && (connectingIdChanged || connectingPhaseChanged)) {
      const dest = destinations[nextConnecting.destination_id]?.destination;
      const label = dest
        ? destinationLabel(dest)
        : nextConnecting.destination_id;
      const short = dest ? shortAddress(dest.address) : "";
      const display = short ? `${label} - ${short}` : label;
      log(`Connecting: ${display} - ${nextConnecting.phase}`);
    }

    const nextReconnecting = response.reconnecting;
    const reconnectingIdChanged =
      state.reconnecting?.destination_id !== nextReconnecting?.destination_id;
    const reconnectingPhaseChanged =
      state.reconnecting?.phase !== nextReconnecting?.phase;
    if (
      nextReconnecting && (reconnectingIdChanged || reconnectingPhaseChanged)
    ) {
      const dest = destinations[nextReconnecting.destination_id]?.destination;
      const label = dest
        ? destinationLabel(dest)
        : nextReconnecting.destination_id;
      const short = dest ? shortAddress(dest.address) : "";
      const display = short ? `${label} - ${short}` : label;
      const phaseSuffix = nextReconnecting.phase
        ? ` - ${nextReconnecting.phase}`
        : "";
      log(`Reconnecting: ${display}${phaseSuffix}`);
    }

    const connectedId = response.connected?.destination_id;
    if (connectedId && connectedId !== state.connected?.destination_id) {
      const dest = destinations[connectedId]?.destination;
      const label = dest ? destinationLabel(dest) : connectedId;
      const short = dest ? shortAddress(dest.address) : "";
      const display = short ? `${label} - ${short}` : label;
      log(`Connected: ${display}`);
    }

    const prevDisconnectingMap = new Map(
      state.disconnecting.map((d) => [d.destination_id, d.phase]),
    );
    for (const d of response.disconnecting) {
      const prevPhase = prevDisconnectingMap.get(d.destination_id);
      if (prevPhase === undefined || prevPhase !== d.phase) {
        const dest = destinations[d.destination_id]?.destination;
        const label = dest ? destinationLabel(dest) : d.destination_id;
        const short = dest ? shortAddress(dest.address) : "";
        const display = short ? `${label} - ${short}` : label;
        log(`Disconnecting: ${display} - ${d.phase}`);
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

  const actions = {
    initializeApp: async () => {
      stopSyncProgress();
      setState("syncProgress", 0);
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
    destinationListOpened: () =>
      destinationMode?.applyUserInput({ type: "listOpened" }),
    destinationListClosed: (picked: string | null) =>
      destinationMode?.applyUserInput({ type: "listClosed", picked }),
  } as const;

  // Keep the persisted channel preference and install marker in step with the
  // package the daemon reports.
  createEffect(() => {
    if (!settingsActions.hydrated()) return; // avoid clobbering stored prefs with defaults
    const pkg = state.serviceInfo?.package_version;
    if (!pkg) return;
    const channel = resolveChannelResync({
      packageVersion: pkg,
      channel: settings.channel,
    });
    if (pkg === settings.installedVersion && !channel) return;
    void settingsActions.syncInstalledVersion(pkg, channel);
  });

  createEffect(() => {
    const d = evaluateUpdate({
      packageVersion: state.serviceInfo?.package_version ?? null,
      manifest: settings.updateManifest ?? null,
      channel: settings.channel,
      dismissedVersion: settings.dismissedUpdateVersion,
    });
    setState("availableVersion", d.availableVersion);
    setState("isUpdateAvailable", d.isUpdateAvailable);
  });

  return [state, actions] as const;
}

const appStore = createRoot(() => createAppStore());

export function useAppStore(): AppStoreTuple {
  return appStore;
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
