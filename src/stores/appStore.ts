import { createStore, reconcile, type Store } from "solid-js/store";

import {
  type Destination,
  type DestinationState,
  formatWarmupStatus,
  isDeployingSafeRunMode,
  isPreparingSafeRunMode,
  isWarmupRunMode,
  type RunMode,
  type ServiceInfo,
  type StatusResponse,
  VPNService,
} from "@src/services/vpnService.ts";
import { useLogsStore } from "@src/stores/logsStore.ts";
import {
  areDestinationsEqualUnordered,
  destinationLabel,
  destinationLabelById,
  getPreferredAvailabilityChangeMessage,
  selectTargetId,
} from "@src/utils/destinations.ts";

import {
  COMPATIBLE_VERSIONS,
  isServiceVersionCompatible,
} from "@src/utils/compatibility.ts";

import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { getConnectionLabel, getConnectionPhase } from "@src/utils/status.ts";
import { getVpnStatus, isConnecting } from "@src/utils/status.ts";
import { shortAddress } from "../utils/shortAddress.ts";

export enum AppScreen {
  Initialization = "initialization",
  Main = "main",
  Onboarding = "onboarding",
  Synchronization = "synchronization",
}

export interface AppState {
  currentScreen: AppScreen;
  serviceInfo: ServiceInfo | null;
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  isLoading: boolean;
  error?: string;
  destination: Destination | null;
  selectedId: string | null;
  runMode: RunMode | null;
  vpnStatus: string;
  warmupStatus: string;
}

type AppActions = {
  initializeApp: () => Promise<void>;
  setScreen: (screen: AppScreen) => void;
  chooseDestination: (id: string | null) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  stopStatusPolling: () => void;
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

const OFFLINE_TIMEOUT = 5000; // ms
const FAST_TIMEOUT = 555; // ms
const DEFAULT_TIMEOUT = 2111; // ms

function initialState(): AppState {
  return {
    availableDestinations: [],
    currentScreen: AppScreen.Initialization,
    destination: null,
    destinations: {},
    error: undefined,
    isLoading: false,
    runMode: null,
    selectedId: null,
    serviceInfo: null,
    vpnStatus: "ServiceUnavailable",
    warmupStatus: "",
  };
}

export function createAppStore(): AppStoreTuple {
  const [state, setState] = createStore<AppState>(initialState());

  let pollingId: ReturnType<typeof globalThis.setTimeout> | undefined;
  let pollingActive = false;

  const [settings] = useSettingsStore();
  let lastPreferredLocation: string | null = settings.preferredLocation;
  let hasInitializedPreferred = false;

  const [, logActions] = useLogsStore();
  const log = (content: string) => logActions.append(content);
  const logStatus = (response: StatusResponse) =>
    logActions.appendStatus(response);

  const applyDestinationSelection = () => {
    const available = state.availableDestinations;
    const userSelected = state.selectedId
      ? available.find((d) => d.id === state.selectedId)
      : undefined;
    if (userSelected) {
      if (state.destination?.id !== userSelected.id) {
        setState("destination", userSelected);
      }
      return;
    }

    const preferred = settings.preferredLocation
      ? available.find((d) => d.id === settings.preferredLocation)
      : undefined;
    if (preferred) {
      if (state.destination?.id !== preferred.id) {
        setState("destination", preferred);
      }
      return;
    }

    if (state.destination !== null) {
      setState("destination", null);
    }
  };

  const syncStatus = async (): Promise<number | null> => {
    let response;
    try {
      response = await VPNService.getStatus();
    } catch (error) {
      console.error("error", error);
      const message = error instanceof Error ? error.message : String(error);
      log(message);
      return null;
    }
    if (!response) {
      return null;
    }

    const [screen, warmupStatus] = determineWarmupStatus(response);
    setState("currentScreen", screen);
    setState("warmupStatus", warmupStatus);

    const prevDestStates = state.destinations;
    const [nextDestStates, availableDestinations] =
      response.destinations.reduce(
        ([states, dests], ds) => {
          states[ds.destination.id] = ds;
          dests.push(ds.destination);
          return [states, dests];
        },
        [{} as Record<string, DestinationState>, [] as Destination[]],
      );

    for (const [id, next] of Object.entries(nextDestStates)) {
      const prev = prevDestStates[id];
      if (!prev) continue;
      const prevLabel = getConnectionLabel(prev.connection_state);
      const nextLabel = getConnectionLabel(next.connection_state);
      const prevPhase = getConnectionPhase(prev.connection_state);
      const nextPhase = getConnectionPhase(next.connection_state);
      const labelChanged = prevLabel !== nextLabel;
      const phaseChanged =
        (nextLabel === "Connecting" || nextLabel === "Disconnecting") &&
        prevPhase !== nextPhase;
      if (
        (labelChanged && nextLabel !== "Unknown" && nextLabel !== "None") ||
        phaseChanged
      ) {
        const label = destinationLabel(next.destination);
        const short = shortAddress(next.destination.address);
        const display = label ? `${label} - ${short}` : short;
        const phaseSuffix = nextPhase ? ` - ${nextPhase}` : "";
        log(`${nextLabel}: ${display}${phaseSuffix}`);
      }
    }

    const prefMsg = getPreferredAvailabilityChangeMessage(
      state.availableDestinations,
      availableDestinations,
      settings.preferredLocation,
    );
    if (prefMsg) log(prefMsg);

    if (!hasInitializedPreferred) {
      lastPreferredLocation = settings.preferredLocation;
      hasInitializedPreferred = true;
    }

    const preferredChanged =
      settings.preferredLocation !== lastPreferredLocation;
    if (preferredChanged) {
      const nowHasPreferred = settings.preferredLocation
        ? availableDestinations.some((d) => d.id === settings.preferredLocation)
        : false;
      if (settings.preferredLocation) {
        if (nowHasPreferred) {
          const pretty = destinationLabelById(
            settings.preferredLocation,
            availableDestinations,
          );
          log(`Preferred location set to ${pretty}.`);
        } else {
          log(
            `Preferred location ${settings.preferredLocation} currently unavailable.`,
          );
        }
      }
      lastPreferredLocation = settings.preferredLocation;
    }

    const hasConnChange = Object.values(state.destinations).some((prev) => {
      const found_next = Object.entries(nextDestStates).find(
        ([id, _]) => id === prev.destination.id,
      );
      if (!found_next) return false;
      const [_, next] = found_next;
      const prevState = prev.connection_state;
      const nextState = next.connection_state;
      if (prevState === nextState) return false;
      const prevLabel = getConnectionLabel(prevState);
      const nextLabel = getConnectionLabel(nextState);
      if (
        prevLabel !== nextLabel &&
        nextLabel !== "None" &&
        nextLabel !== "Unknown"
      ) {
        return true;
      }
      if (nextLabel === "Connecting") {
        const prevPhase = getConnectionPhase(prevState);
        const nextPhase = getConnectionPhase(nextState);
        return prevPhase !== nextPhase;
      }
      if (nextLabel === "Disconnecting") {
        const prevPhase = getConnectionPhase(prevState);
        const nextPhase = getConnectionPhase(nextState);
        return prevPhase !== nextPhase;
      }
      return false;
    });
    if (!preferredChanged && !hasConnChange) {
      logStatus(response);
    }

    setState("runMode", reconcile(response.run_mode));
    setState("destinations", nextDestStates);

    const vpnStatus = getVpnStatus(response.run_mode, response.destinations);
    setState("vpnStatus", vpnStatus);

    if (
      !areDestinationsEqualUnordered(
        availableDestinations,
        state.availableDestinations,
      )
    ) {
      setState("availableDestinations", availableDestinations);
      applyDestinationSelection();
    }
    setState("error", undefined);

    if (preferredChanged) {
      applyDestinationSelection();
    }

    return timeoutFromState(response.run_mode, response.destinations);
  };

  const startStatusPolling = (resetCb: () => void) => {
    pollingActive = true;
    clearTimeout(pollingId);
    const tick = async () => {
      if (!pollingActive) return;
      const timeout = await syncStatus();
      if (!timeout) {
        resetCb();
        return;
      }
      if (!pollingActive) return;
      clearTimeout(pollingId);
      pollingId = setTimeout(tick, timeout);
    };
    tick();
  };

  const actions = {
    initializeApp: async () => {
      setState("isLoading", true);
      try {
        const info = await VPNService.info();
        setState("serviceInfo", info);
        if (isServiceVersionCompatible(info.version)) {
          await VPNService.startClient(10);
          startStatusPolling(() => {
            setState(reconcile(initialState()));
            setTimeout(() => {
              actions.stopStatusPolling();
              actions.initializeApp();
            }, 0);
          });
        } else {
          log(
            "Incompatible service version: " +
              info.version +
              " can only work with versions: " +
              COMPATIBLE_VERSIONS.join(", "),
          );
          setState(
            "error",
            "Incompatible service version: " +
              info.version +
              ". Supported versions: " +
              COMPATIBLE_VERSIONS.join(", "),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log("Failed to connect to service: " + message);
        setState("error", message);
        setTimeout(() => actions.initializeApp(), OFFLINE_TIMEOUT);
      } finally {
        setState("isLoading", false);
      }
    },

    setScreen: (screen: AppScreen) => setState("currentScreen", screen),

    chooseDestination: (id: string | null) => {
      setState("selectedId", id ?? null);
      applyDestinationSelection();
    },

    connect: async () => {
      setState("isLoading", true);
      const requestedId = state.selectedId ?? undefined;
      const { id: targetId, reason: selectionReason } = selectTargetId(
        requestedId,
        settings.preferredLocation,
        state.availableDestinations,
      );

      const reasonForLog = requestedId ? "selected exit node" : selectionReason;
      if (targetId && reasonForLog !== "selected exit node") {
        const selected = state.availableDestinations.find(
          (d) => d.id === targetId,
        );
        if (!selected) {
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

    stopStatusPolling: () => {
      pollingActive = false;
      clearTimeout(pollingId);
      pollingId = undefined;
    },
  } as const;

  return [state, actions] as const;
}

const appStore = createAppStore();

export function useAppStore(): AppStoreTuple {
  return appStore;
}

function timeoutFromState(
  runMode: RunMode | undefined,
  destinations: DestinationState[],
): number {
  if (isWarmupRunMode(runMode)) {
    return FAST_TIMEOUT;
  }
  if (isConnecting(Object.values(destinations))) {
    return FAST_TIMEOUT;
  }
  return DEFAULT_TIMEOUT;
}

function determineWarmupStatus(status: StatusResponse): [AppScreen, string] {
  const runMode = status.run_mode;
  if (runMode === "Shutdown") {
    return [AppScreen.Main, "Shutdown"];
  }
  if (isPreparingSafeRunMode(runMode)) {
    return [AppScreen.Onboarding, "Onboarding"];
  }
  if (isDeployingSafeRunMode(runMode)) {
    return [AppScreen.Synchronization, "Safe deployment ongoing"];
  }
  if (isWarmupRunMode(runMode)) {
    return [
      AppScreen.Synchronization,
      formatWarmupStatus(runMode.Warmup.status),
    ];
  }
  // delay initial screen as long as no interaction makes sense
  const delay = findDelayReason(status.destinations);
  if (delay) {
    return [AppScreen.Synchronization, delay];
  }
  return [AppScreen.Main, "Moving on"];
}

function findDelayReason(destinations: DestinationState[]): string | null {
  let missing_peers = 0;
  let missing_channels = 0;
  for (const ds of destinations) {
    switch (ds.connectivity.health) {
      case "ReadyToConnect":
        return null;
      case "MissingPeeredFundedChannel":
        missing_peers++;
        missing_channels++;
        break;
      case "MissingPeeredChannel":
        missing_peers++;
        break;
      case "MissingFundedChannel":
        missing_channels++;
        break;
      default:
        break;
    }
  }
  if (missing_peers >= missing_channels) {
    return `Looking for ${missing_peers} more peer${missing_peers > 1 ? "s" : ""}`;
  }
  if (missing_channels > 0) {
    return `Setting up ${missing_channels} more channel${missing_channels > 1 ? "s" : ""}`;
  }
  return null;
}
