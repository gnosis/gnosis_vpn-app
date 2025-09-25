import { createStore, reconcile, type Store } from "solid-js/store";
import {
  type Destination,
  FundingState,
  type Status,
  type StatusResponse,
  VPNService,
} from "../services/vpnService.ts";
import { useLogsStore } from "./logsStore.ts";
import {
  areDestinationsEqualUnordered,
  formatDestinationByAddress,
  getPreferredAvailabilityChangeMessage,
  selectTargetAddress,
} from "../utils/destinations.ts";
import { useSettingsStore } from "./settingsStore.ts";
import { isConnected, isConnecting } from "../utils/status.ts";

export type AppScreen = "main" | "settings" | "logs" | "usage";

export interface AppState {
  currentScreen: AppScreen;
  connectionStatus: Status;
  availableDestinations: Destination[];
  isLoading: boolean;
  fundingStatus: FundingState;
  error?: string;
  logs: { date: string; message: string }[];
  destination: Destination | null;
  selectedAddress: string | null;
}

type AppActions = {
  setScreen: (screen: AppScreen) => void;
  chooseDestination: (address: string | null) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  startStatusPolling: (intervalMs?: number) => void;
  stopStatusPolling: () => void;
  log: (message: string) => void;
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

export function createAppStore(): AppStoreTuple {
  const [state, setState] = createStore<AppState>({
    currentScreen: "main",
    connectionStatus: "ServiceUnavailable",
    availableDestinations: [],
    isLoading: false,
    logs: [],
    fundingStatus: "Unknown",
    destination: null,
    selectedAddress: null,
  });

  let pollingId: ReturnType<typeof globalThis.setInterval> | undefined;
  let pollInFlight = false;

  const [settings] = useSettingsStore();
  let lastPreferredLocation: string | null = settings.preferredLocation;
  let hasInitializedPreferred = false;

  const [, logActions] = useLogsStore();
  const log = (content: string) => logActions.append(content);
  const logStatus = (response: StatusResponse) => logActions.appendStatus(response);

  const applyDestinationSelection = () => {
    const available = state.availableDestinations;
    const userSelected = state.selectedAddress ? available.find(d => d.address === state.selectedAddress) : undefined;
    if (userSelected) {
      if (state.destination?.address !== userSelected.address) {
        setState("destination", userSelected);
      }
      return;
    }

    const preferred = settings.preferredLocation
      ? available.find(d => d.address === settings.preferredLocation)
      : undefined;
    if (preferred) {
      if (state.destination?.address !== preferred.address) {
        setState("destination", preferred);
      }
      return;
    }

    if (state.destination !== null) {
      setState("destination", null);
    }
  };

  const getStatus = async () => {
    try {
      const response = await VPNService.getStatus();
      const prefMsg = getPreferredAvailabilityChangeMessage(
        state.availableDestinations,
        response.available_destinations,
        settings.preferredLocation,
      );
      if (prefMsg) log(prefMsg);

      if (!hasInitializedPreferred) {
        // On first tick after startup, treat current value as baseline (no user change)
        lastPreferredLocation = settings.preferredLocation;
        hasInitializedPreferred = true;
      }

      const preferredChanged = settings.preferredLocation !== lastPreferredLocation;
      if (preferredChanged) {
        const nowHasPreferred = settings.preferredLocation
          ? response.available_destinations.some(d => d.address === settings.preferredLocation)
          : false;
        if (settings.preferredLocation) {
          if (nowHasPreferred) {
            const pretty = formatDestinationByAddress(settings.preferredLocation, response.available_destinations);
            log(`Preferred location set to ${pretty}.`);
          } else {
            log(`Preferred location ${settings.preferredLocation} currently unavailable.`);
          }
        }
        lastPreferredLocation = settings.preferredLocation;
      }
      if (!preferredChanged) {
        logStatus(response);
      }
      if (response.status !== state.connectionStatus) {
        setState("connectionStatus", reconcile(response.status));
      }
      if (!areDestinationsEqualUnordered(response.available_destinations, state.availableDestinations)) {
        setState("availableDestinations", response.available_destinations);
        applyDestinationSelection();
      }
      setState("error", undefined);
      setState("fundingStatus", response.funding);

      if (preferredChanged) {
        applyDestinationSelection();
      }
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
      setState("isLoading", false);
      setState("connectionStatus", "ServiceUnavailable");
      setState("availableDestinations", []);
      setState("error", error instanceof Error ? error.message : String(error));
      if (state.destination !== null) setState("destination", null);
    }
  };

  const actions = {
    setScreen: (screen: AppScreen) => setState("currentScreen", screen),

    chooseDestination: (address: string | null) => {
      setState("selectedAddress", address ?? null);
      applyDestinationSelection();

      if (address && (isConnected(state.connectionStatus) || isConnecting(state.connectionStatus))) {
        setState("isLoading", true);
        void (async () => {
          try {
            log(`Connecting to selected exit node: ${address}`);
            await VPNService.connect(address);
            await getStatus();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log(message);
            setState("error", message);
          } finally {
            setState("isLoading", false);
          }
        })();
      }
    },

    connect: async () => {
      setState("isLoading", true);
      try {
        const requestedAddress = state.selectedAddress ?? undefined;
        const { address: targetAddress, reason: selectionReason } = selectTargetAddress(
          requestedAddress,
          settings.preferredLocation,
          state.availableDestinations,
        );

        const reasonForLog = state.selectedAddress ? "selected exit node" : selectionReason;
        log(`Connecting to ${reasonForLog}: ${targetAddress ?? "none"}`);

        if (targetAddress) {
          await VPNService.connect(targetAddress);
        }
        await getStatus();
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
        await getStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(message);
        setState("error", message);
      } finally {
        setState("isLoading", false);
      }
    },

    refreshStatus: async () => {
      setState("isLoading", true);
      await getStatus();
      setState("isLoading", false);
    },

    startStatusPolling: (intervalMs: number = 2000) => {
      if (pollingId !== undefined) return;
      const tick = async () => {
        if (pollInFlight) return;
        pollInFlight = true;
        await getStatus();
        pollInFlight = false;
      };

      // immediate tick, then interval
      void tick();
      pollingId = globalThis.setInterval(() => void tick(), intervalMs);
    },

    stopStatusPolling: () => {
      if (pollingId !== undefined) {
        globalThis.clearInterval(pollingId);
        pollingId = undefined;
      }
    },

    log: (message: string) => {
      log(message);
    },
  } as const;

  return [state, actions] as const;
}

const appStore = createAppStore();

export function useAppStore(): AppStoreTuple {
  return appStore;
}
