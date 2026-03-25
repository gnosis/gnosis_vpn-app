import { createStore, reconcile, type Store } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";

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
  destinationLabel,
  getPreferredAvailabilityChangeMessage,
  selectTargetId,
} from "@src/utils/destinations.ts";

import {
  COMPATIBLE_VERSIONS,
  isServiceVersionCompatible,
} from "@src/utils/compatibility.ts";

import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { getConnectionLabel, getConnectionPhase } from "@src/utils/status.ts";
import { deriveVPNStatus } from "@src/utils/status.ts";
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
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

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

  let unlistenStatusUpdate: (() => void) | undefined;

  const [settings] = useSettingsStore();
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

  const processStatusResponse = (response: StatusResponse) => {
    const [screen, warmupStatus] = determineScreenAndStatus(response);
    const availableDestinations = Object.values(response.destinations).map(
      (ds) => ds.destination,
    );
    logStateChange(response);
    logPrefMsg(availableDestinations);
    logStatus(response);
    setState("error", undefined);
    setState("currentScreen", screen);
    setState("warmupStatus", warmupStatus);
    setState("runMode", reconcile(response.run_mode));
    setState("destinations", reconcile(response.destinations));
    setState("vpnStatus", deriveVPNStatus(response));
    setState("availableDestinations", availableDestinations);
    applyDestinationSelection();
  };

  const logStateChange = (response: StatusResponse) => {
    const prevDestStates = state.destinations;
    response.dest_order.forEach((id) => {
      const prev = prevDestStates[id];
      const next = response.destinations[id];
      if (!prev || !next) return;
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
    });
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

  const actions = {
    initializeApp: async () => {
      setState("isLoading", true);
      try {
        const info = await VPNService.info();
        setState("serviceInfo", info);
        if (isServiceVersionCompatible(info.version)) {
          await VPNService.startClient(10);
          await VPNService.startStatusPolling();
          if (unlistenStatusUpdate) {
            unlistenStatusUpdate();
          }
          unlistenStatusUpdate = await listen<Promise<StatusResponse | null>>(
            "status",
            async (event) => {
              try {
                const resp = await event.payload;
                if (resp) {
                  processStatusResponse(resp);
                } else {
                  setState("vpnStatus", "ServiceUnavailable");
                }
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                console.error("Error processing status update", message);
                log(message);
              }
            },
          );
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
  | { alreadyRan: true } = { neverRan: true };
function determineScreenAndStatus(status: StatusResponse): [AppScreen, string] {
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
  const delay = findDelayReason(Object.values(status.destinations));
  if (delay) {
    // delay proposed and never ran
    if ("neverRan" in initialDelay) {
      // leads to start delay
      initialDelay = { delayingSince: Date.now() };
      return [AppScreen.Synchronization, delay];
    }
    // delay proposed and already in delay
    if ("delayingSince" in initialDelay) {
      // leads to continue delay until maximum time is reached
      if (Date.now() - initialDelay.delayingSince > MAXIMUM_DELAY_TIME) {
        // if the delay reason persists for too long, move on to main screen
        initialDelay = { alreadyRan: true };
        return [AppScreen.Main, "Moving on"];
      }
      return [AppScreen.Synchronization, delay];
    }
    // delay proposed but already ran
    if ("alreadyRan" in initialDelay) {
      // leads to main screen
      return [AppScreen.Main, "Moving on"];
    }
  }
  // no delay proposed - treat as if already ran
  initialDelay = { alreadyRan: true };
  return [AppScreen.Main, "Moving on"];
}

function findDelayReason(destinations: DestinationState[]): string | null {
  let missingPeers = 0;
  let missingChannels = 0;
  for (const ds of destinations) {
    switch (ds.connectivity.health) {
      case "ReadyToConnect":
        return null;
      case "MissingPeeredFundedChannel":
        missingPeers++;
        missingChannels++;
        break;
      case "MissingPeeredChannel":
        missingPeers++;
        break;
      case "MissingFundedChannel":
        missingChannels++;
        break;
      default:
        break;
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
