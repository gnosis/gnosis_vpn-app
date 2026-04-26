import { createStore, reconcile, type Store } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";

import {
  type ConnectingInfo,
  type Destination,
  type DestinationState,
  type DisconnectingInfo,
  formatWarmupStatus,
  isDeployingSafeRunMode,
  isPreparingSafeRunMode,
  isWarmupRunMode,
  type RunMode,
  type ServiceInfo,
  type StatusResponse,
  StatusResponseSchema,
  VPNService,
} from "@src/services/vpnService.ts";
import { useLogsStore } from "@src/stores/logsStore.ts";
import {
  destinationLabel,
  getPreferredAvailabilityChangeMessage,
  resolveAutoDestination,
} from "@src/utils/destinations.ts";

import {
  COMPATIBLE_VERSIONS,
  isServiceVersionCompatible,
} from "@src/utils/compatibility.ts";

import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { deriveVPNStatus } from "@src/utils/status.ts";
import { shortAddress } from "../utils/shortAddress.ts";

export enum AppScreen {
  Initialization = "initialization",
  Main = "main",
  Onboarding = "onboarding",
  Synchronization = "synchronization",
}

export interface AppState {
  appVersion: string;
  currentScreen: AppScreen;
  serviceInfo: ServiceInfo | null;
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  connected: string | null;
  connecting: ConnectingInfo | null;
  disconnecting: DisconnectingInfo[];
  isLoading: boolean;
  error?: string;
  destination: Destination | null;
  selectedId: string | null;
  runMode: RunMode | null;
  vpnStatus: string;
  warmupStatus: string;
  syncProgress: number;
  syncRecoveryDeadline: number | null;
}

type AppActions = {
  initializeApp: (appVersion: string) => Promise<void>;
  setScreen: (screen: AppScreen) => void;
  chooseDestination: (id: string | null) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

type StatusEvent = {
  payload: { Ok: StatusResponse | null } | { Err: string };
  id: number;
  event: string;
};

function initialState(): AppState {
  return {
    appVersion: "",
    availableDestinations: [],
    connected: null,
    connecting: null,
    currentScreen: AppScreen.Initialization,
    destination: null,
    destinations: {},
    disconnecting: [],
    error: undefined,
    isLoading: false,
    runMode: null,
    selectedId: null,
    serviceInfo: null,
    vpnStatus: "ServiceUnavailable",
    warmupStatus: "",
    syncProgress: 0,
    syncRecoveryDeadline: null,
  };
}

// Phase boundaries and expected durations for sync progress estimation.
// floor/ceiling are % values; durationMs is the expected phase duration.
// Adjust durationMs when real-world timing data is available.
const SYNC_PHASES = [
  { floor: 0, ceiling: 30, durationMs: 30_000 }, // DeployingSafe
  { floor: 30, ceiling: 40, durationMs: 10_000 }, // Warmup
  { floor: 40, ceiling: 100, durationMs: 60_000 }, // Channels/peers delay
] as const;
type SyncPhaseIndex = 0 | 1 | 2;

export function createAppStore(): AppStoreTuple {
  const [state, setState] = createStore<AppState>(initialState());

  let unlistenStatusUpdate: (() => void) | undefined;
  let connectedOnOpenDetected = false;
  let activeSyncPhase: SyncPhaseIndex | null = null;
  let syncPhaseStartTime = 0;
  let syncTimer: ReturnType<typeof setInterval> | undefined;
  let catchUpTarget: number | null = null;
  let pendingScreenTransition: AppScreen | null = null;

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

  const [settings] = useSettingsStore();
  const [, logActions] = useLogsStore();
  const log = (content: string) => logActions.append(content);
  const logStatus = (response: StatusResponse) =>
    logActions.appendStatus(response);

  const applyDestinationSelection = () => {
    // 1. Explicit user selection
    if (state.selectedId) {
      const dest = state.destinations[state.selectedId];
      if (dest) {
        setState("destination", dest.destination);
        return;
      }
    }

    // 2. Service already connected/connecting when app opened (one-time detection).
    // Only runs until we've detected it once — avoids locking out "Random" mode
    // after the user later chooses it and a connection succeeds.
    if (!connectedOnOpenDetected) {
      const activeId = state.connected ?? state.connecting?.destination_id;
      const connectedEntry = activeId
        ? state.destinations[activeId]
        : undefined;
      if (connectedEntry) {
        connectedOnOpenDetected = true;
        setState("selectedId", connectedEntry.destination.id);
        setState("destination", connectedEntry.destination);
        return;
      }
      // No connection found yet — mark as done once destinations are present
      // so a fresh session doesn't keep probing after the user has interacted.
      if (Object.values(state.destinations).length > 0) {
        connectedOnOpenDetected = true;
      }
    }

    // 3. Preferred location (if available).
    // Only sets destination — not selectedId — so the user's "Auto" choice
    // stays visible. connect() resolves preferredLocation independently via
    // resolveAutoDestination.
    if (settings.preferredLocation) {
      const dest = state.destinations[settings.preferredLocation];
      if (dest) {
        setState("destination", dest.destination);
        return;
      }
    }

    setState("destination", null);
  };

  const processStatusResponse = (response: StatusResponse) => {
    const [screen, warmupStatus, stuckSince] = determineScreenAndStatus(
      response,
    );
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
    setState(
      "syncRecoveryDeadline",
      stuckSince !== null ? stuckSince + MAXIMUM_DELAY_TIME : null,
    );
    setState("runMode", reconcile(response.run_mode));
    setState("destinations", reconcile(destinations));
    setState("connected", response.connected);
    setState("connecting", reconcile(response.connecting));
    setState("disconnecting", reconcile(response.disconnecting));
    setState("vpnStatus", deriveVPNStatus(response));
    setState("availableDestinations", availableDestinations);
    applyDestinationSelection();
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

    if (response.connected && response.connected !== state.connected) {
      const dest = destinations[response.connected]?.destination;
      const label = dest ? destinationLabel(dest) : response.connected;
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

  const OFFLINE_TIMEOUT = 5000; // ms
  let redoTimeout: ReturnType<typeof setTimeout> | undefined;

  const actions = {
    /**
     * Run initialization logic, will keep looping.
     * Reset upon calling it again.
     */
    initializeApp: async (appVersion: string) => {
      clearTimeout(redoTimeout);
      redoTimeout = undefined;
      connectedOnOpenDetected = false;
      stopSyncProgress();
      setState("syncProgress", 0);
      if (unlistenStatusUpdate) {
        unlistenStatusUpdate();
        unlistenStatusUpdate = undefined;
      }
      setState("appVersion", appVersion);

      const criticalError = (message: string) => {
        log(message);
        connectedOnOpenDetected = false;
        stopSyncProgress();
        setState(reconcile(initialState()));
        setState("appVersion", appVersion);
        setState("error", message);
        if (unlistenStatusUpdate) {
          unlistenStatusUpdate();
          unlistenStatusUpdate = undefined;
        }
        redoTimeout = setTimeout(
          () => actions.initializeApp(appVersion),
          OFFLINE_TIMEOUT,
        );
      };

      let info;
      try {
        info = await VPNService.info();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const message = "Failed to get service info: " + errorMsg;
        criticalError(message);
        return;
      }

      setState("serviceInfo", info);
      if (!isServiceVersionCompatible(info.version)) {
        const message = "Incompatible service version: " +
          info.version +
          ". Supported versions: " +
          COMPATIBLE_VERSIONS.join(", ") +
          `. If you just updated, please restart the app (App Version: ${appVersion}).`;
        criticalError(message);
        return;
      }

      try {
        await VPNService.startClient(10);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const message = "Failed to start client worker: " + errorMsg;
        criticalError(message);
        return;
      }

      try {
        await VPNService.startStatusPolling();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const message = "Failed to start status polling: " + errorMsg;
        criticalError(message);
        return;
      }

      // for some reason the expected TS type here is wrong
      // thats why we cast the type (3 lines below) to the expected one, even if it is not correct according to the event emitter
      const listenCb = (event: unknown) => {
        let statusResp: StatusResponse | void;
        try {
          statusResp = incomingStatusEvent(event as StatusEvent);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const message = "Error processing status update: " + errorMsg;
          criticalError(message);
          return;
        }

        if (!statusResp) {
          const errorMsg = "Received empty status response";
          criticalError(errorMsg);
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
        const message = "Failed to listen for status updates: " + errorMsg;
        criticalError(message);
        return;
      }
    },

    setScreen: (screen: AppScreen) => setState("currentScreen", screen),

    chooseDestination: (id: string | null) => {
      setState("selectedId", id ?? null);
      applyDestinationSelection();
    },

    connect: async () => {
      setState("isLoading", true);
      const requestedId = state.selectedId;
      const { id: targetId, reason: selectionReason } = requestedId
        ? { id: requestedId, reason: "selected exit node" }
        : {
          id: resolveAutoDestination(
            state.availableDestinations,
            state.destinations,
            settings.preferredLocation,
          )?.id,
          reason: "auto destination",
        };

      const reasonForLog = requestedId ? "selected exit node" : selectionReason;
      if (targetId && reasonForLog !== "selected exit node") {
        const selected = state.availableDestinations.find(
          (d) => d.id === targetId,
        );
        if (!selected) {
          setState("isLoading", false);
          return;
        }
        const name = destinationLabel(selected);
        const short = shortAddress(selected.address);
        const pretty = `${name} - ${short}`;
        log(`Connecting to ${reasonForLog}: ${pretty}`);
      }

      try {
        if (targetId) {
          await VPNService.connect(targetId);
        }
        applyDestinationSelection();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(message);
        setState("error", message);
      } finally {
        setState("isLoading", false);
      }
    },

    disconnect: async () => {
      setState("isLoading", true);
      try {
        await VPNService.disconnect();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(message);
        setState("error", message);
      } finally {
        setState("isLoading", false);
      }
    },
  } as const;

  return [state, actions] as const;
}

const appStore = createAppStore();

export function useAppStore(): AppStoreTuple {
  return appStore;
}

const MAXIMUM_DELAY_TIME = 120 * 1000; // 2 minutes
let initialDelay:
  | { delayingSince: number }
  | { neverRan: true }
  | {
    alreadyRan: true;
  } = { neverRan: true };
function determineScreenAndStatus(
  status: StatusResponse,
): [AppScreen, string, number | null] {
  const runMode = status.run_mode;
  if (runMode === "Shutdown") {
    return [AppScreen.Main, "Shutdown", null];
  }
  if (isPreparingSafeRunMode(runMode)) {
    return [AppScreen.Onboarding, "Onboarding", null];
  }
  if (isDeployingSafeRunMode(runMode)) {
    return [AppScreen.Synchronization, "Safe deployment ongoing", null];
  }
  if (isWarmupRunMode(runMode)) {
    return [
      AppScreen.Synchronization,
      formatWarmupStatus(runMode.Warmup.status),
      null,
    ];
  }
  // delay initial screen as long as no interaction makes sense
  const delay = findDelayReason(status.destinations);
  if (delay) {
    // delay proposed and never ran
    if ("neverRan" in initialDelay) {
      // leads to start delay
      const delayingSince = Date.now();
      initialDelay = { delayingSince };
      return [AppScreen.Synchronization, delay, delayingSince];
    }
    // delay proposed and already in delay
    if ("delayingSince" in initialDelay) {
      // leads to continue delay until maximum time is reached
      if (Date.now() - initialDelay.delayingSince > MAXIMUM_DELAY_TIME) {
        // if the delay reason persists for too long, move on to main screen
        initialDelay = { alreadyRan: true };
        return [AppScreen.Main, "Moving on", null];
      }
      return [AppScreen.Synchronization, delay, initialDelay.delayingSince];
    }
    // delay proposed but already ran
    if ("alreadyRan" in initialDelay) {
      // leads to main screen
      return [AppScreen.Main, "Moving on", null];
    }
  }
  // no delay proposed - treat as if already ran
  initialDelay = { alreadyRan: true };
  return [AppScreen.Main, "Moving on", null];
}

function findDelayReason(destinations: DestinationState[]): string | null {
  let missingPeers = 0;
  let missingChannels = 0;
  for (const ds of destinations) {
    const state = ds.route_health?.state;
    if (
      typeof state === "object" &&
      ("ReadyToConnect" in state || "Connecting" in state)
    ) {
      return null;
    }
    if (state === "NeedsFunding") {
      missingChannels++;
    } else if (typeof state === "object" && "NeedsPeering" in state) {
      missingPeers++;
      if (!state.NeedsPeering.funded) missingChannels++;
    }
  }
  if (missingPeers > 0 && missingPeers >= missingChannels) {
    return `Looking for ${missingPeers} more peer${
      missingPeers > 1 ? "s" : ""
    }`;
  }
  if (missingChannels > 0) {
    return `Setting up ${missingChannels} more channel${
      missingChannels > 1 ? "s" : ""
    }`;
  }
  return null;
}

function detectSyncPhase(response: StatusResponse): SyncPhaseIndex | null {
  const { run_mode, destinations } = response;
  if (isDeployingSafeRunMode(run_mode)) return 0;
  if (isWarmupRunMode(run_mode)) return 1;
  if (findDelayReason(Object.values(destinations))) return 2;
  return null;
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
      console.error("Issues with StatusResponseSchema", rawRes.Ok);
      for (const i of res.error.issues) {
        console.error("Type error:", i);
      }
      const message = `Received invalid status response`;
      console.error(message);
      throw new Error(message);
    }
  } else {
    console.error("Error processing status update", rawRes.Err);
    throw new Error(rawRes.Err);
  }
}
