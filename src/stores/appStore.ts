import { createStore, reconcile, type Store } from "solid-js/store";
import {
  type Destination,
  type DestinationState,
  formatWarmupStatus,
  type RunMode,
  type StatusResponse,
  VPNService,
} from "@src/services/vpnService.ts";
import { useLogsStore } from "@src/stores/logsStore.ts";
import {
  areDestinationsEqualUnordered,
  formatDestination,
  formatDestinationById,
  getPreferredAvailabilityChangeMessage,
  selectTargetId,
} from "@src/utils/destinations.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { getConnectionLabel, getConnectionPhase } from "@src/utils/status.ts";
import { getVpnStatus, isConnecting } from "@src/utils/status.ts";
import { shortAddress } from "../utils/shortAddress.ts";

export enum AppScreen {
  Main = "main",
  Onboarding = "onboarding",
  Synchronization = "synchronization",
}

export interface AppState {
  currentScreen: AppScreen;
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  isLoading: boolean;
  error?: string;
  destination: Destination | null;
  selectedId: string | null;
  runMode: RunMode | null;
  vpnStatus: string;
}

type AppActions = {
  setScreen: (screen: AppScreen) => void;
  chooseDestination: (id: string | null) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  startStatusPolling: () => void;
  stopStatusPolling: () => void;
  claimAirdrop: (secret: string) => Promise<void>;
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

const OFFLINE_TIMEOUT = 5000; // ms
const FAST_TIMEOUT = 555; // ms
const DEFAULT_TIMEOUT = 2111; // ms

export function createAppStore(): AppStoreTuple {
  const [state, setState] = createStore<AppState>({
    currentScreen: AppScreen.Main,
    availableDestinations: [],
    destinations: {},
    isLoading: false,
    destination: null,
    selectedId: null,
    runMode: null,
    vpnStatus: "ServiceUnavailable",
  });

  let pollingId: ReturnType<typeof globalThis.setTimeout> | undefined;

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

  const syncStatus = async () => {
    let response;
    try {
      response = await VPNService.getStatus();
      console.log("response", response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("error", error);

      log(message);
      setState("isLoading", false);
      setState("runMode", null);
      setState("availableDestinations", []);
      setState("destinations", {});
      setState("error", message);
      setState("vpnStatus", "ServiceUnavailable");
      if (state.destination !== null) {
        setState("destination", null);
      }
      return OFFLINE_TIMEOUT;
    }

    const screen = screenFromRunMode(response.run_mode);
    setState("currentScreen", screen);

    const prevDestStates = state.destinations;
    const [nextDestStates, availableDestinations] = response.destinations
      .reduce(
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
        const where = formatDestination(next.destination);
        const short = shortAddress(next.destination.address);
        const display = where && where.length > 0
          ? `${where} - ${short}`
          : short;
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
          const pretty = formatDestinationById(
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

  const actions = {
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
        const name = formatDestination(selected);
        const short = shortAddress(selected.address);
        const pretty = `${name} - ${short}`;
        log(`Connecting to ${reasonForLog}: ${pretty}`);
      }

      try {
        if (targetId) {
          await VPNService.connect(targetId);
        }
        actions.startStatusPolling();
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
        actions.startStatusPolling();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(message);
        setState("error", message);
      } finally {
        setState("isLoading", false);
      }
    },

    refreshStatus: (): Promise<void> => {
      setState("isLoading", true);
      actions.startStatusPolling();
      setState("isLoading", false);
      return Promise.resolve();
    },

    startStatusPolling: () => {
      // cancel any waiting
      clearTimeout(pollingId);
      const tick = async () => {
        const timeout = await syncStatus();
        // cancel any onoing that got triggered too fast in a row
        clearTimeout(pollingId);
        pollingId = setTimeout(tick, timeout);
      };
      tick();
    },

    stopStatusPolling: () => {
      globalThis.clearTimeout(pollingId);
    },

    claimAirdrop: async (secret: string) => {
      try {
        await VPNService.fundingTool(secret);
        actions.startStatusPolling();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(message);
        setState("error", message);
      }
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
  if (runMode && typeof runMode === "object" && "Warmup" in runMode) {
    return FAST_TIMEOUT;
  }
  if (isConnecting(Object.values(destinations))) {
    return FAST_TIMEOUT;
  }
  return DEFAULT_TIMEOUT;
}

function screenFromRunMode(mode: RunMode): AppScreen {
  if (mode === "Shutdown") {
    return AppScreen.Main;
  }
  if ("PreparingSafe" in mode) {
    return AppScreen.Onboarding;
  }
  if ("DeployingSafe" in mode) {
    return AppScreen.Synchronization;
  }
  if ("Warmup" in mode) {
    return AppScreen.Synchronization;
  }
  return AppScreen.Main;
}

export function formatWarmup(runMode: RunMode | null): string {
  if (!runMode) {
    return "Service unavailable";
  }
  if (typeof runMode === "string") {
    return runMode;
  }
  if ("DeployingSafe" in runMode) {
    return `Safe deployment ongoing`;
  }
  if ("Warmup" in runMode) {
    return formatWarmupStatus(runMode.Warmup.status);
  }
  return "Moving on";
}
