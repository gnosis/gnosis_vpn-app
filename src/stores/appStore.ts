import { createStore, reconcile, type Store } from "solid-js/store";
import { createEffect } from "solid-js";
import {
  type Destination,
  type RunMode,
  type StatusResponse,
  VPNService,
} from "@src/services/vpnService.ts";
import { useLogsStore } from "@src/stores/logsStore.ts";
import {
  areDestinationsEqualUnordered,
  formatDestinationByAddress,
  getPreferredAvailabilityChangeMessage,
  selectTargetAddress,
} from "@src/utils/destinations.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { getVpnStatus, isConnected, isConnecting } from "@src/utils/status.ts";
import { getEthAddress } from "@src/utils/address.ts";
import { useNodeAnalyticsStore } from "@src/stores/nodeAnalyticsStore.ts";

export type AppScreen = "main" | "onboarding" | "synchronization";

// export interface AppState {
//   currentScreen: AppScreen;
//   connectionStatus: Status;
//   availableDestinations: Destination[];
//   isLoading: boolean;
//   // fundingStatus: FundingState;
//   error?: string;
//   destination: Destination | null;
//   selectedAddress: string | null;
//   preparingSafe: PreparingSafe | null;
// }

export interface AppState {
  currentScreen: AppScreen;
  availableDestinations: Destination[];
  isLoading: boolean;
  // fundingStatus: FundingState;
  error?: string;
  destination: Destination | null;
  selectedAddress: string | null;
  // preparingSafe: PreparingSafe | null;
  runMode: RunMode | null;
  vpnStatus:
    | "ServiceUnavailable"
    | "PreparingSafe"
    | "Warmup"
    | "Connecting"
    | "Connected"
    | "Disconnecting"
    | "Disconnected";
}

type AppActions = {
  setScreen: (screen: AppScreen) => void;
  chooseDestination: (address: string | null) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  startStatusPolling: (intervalMs?: number) => void;
  stopStatusPolling: () => void;
  claimAirdrop: (secret: string) => Promise<void>;
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

export function createAppStore(): AppStoreTuple {
  const [state, setState] = createStore<AppState>({
    currentScreen: "main",
    availableDestinations: [],
    isLoading: false,
    destination: null,
    selectedAddress: null,
    runMode: null,
    vpnStatus: "ServiceUnavailable",
  });

  let pollingId: ReturnType<typeof globalThis.setInterval> | undefined;
  let pollInFlight = false;
  let currentConnectionStart: number | null = null;
  let previousVpnStatus: string | null = null;
  let lastConnectedAddress: string | null = null;

  const [settings] = useSettingsStore();
  const [, analyticsActions] = useNodeAnalyticsStore();
  let lastPreferredLocation: string | null = settings.preferredLocation;
  let hasInitializedPreferred = false;

  const [, logActions] = useLogsStore();
  const log = (content: string) => logActions.append(content);
  const logStatus = (response: StatusResponse) =>
    logActions.appendStatus(response);

  // Watch for status transitions from Connected to any other state
  createEffect(() => {
    const currentStatus = state.vpnStatus;
    
    // Detect transition from Connected to Disconnected/Disconnecting
    if (previousVpnStatus === "Connected" && currentStatus !== "Connected") {
      // Record session duration for any disconnection (manual, error, network drop)
      if (currentConnectionStart && lastConnectedAddress) {
        const duration = (Date.now() - currentConnectionStart) / 1000;
        analyticsActions.updateSessionDuration(lastConnectedAddress, duration);
        currentConnectionStart = null;
        lastConnectedAddress = null;
      }
    }
    
    previousVpnStatus = currentStatus;
  });

  const applyDestinationSelection = () => {
    const available = state.availableDestinations;
    const userSelected = state.selectedAddress
      ? available.find((d: Destination) => d.address === state.selectedAddress)
      : undefined;
    if (userSelected) {
      if (state.destination?.address !== userSelected.address) {
        setState("destination", userSelected);
      }
      return;
    }

    const preferred = settings.preferredLocation
      ? available.find((d: Destination) => d.address === settings.preferredLocation)
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
      console.log("response", response);

      let normalizedRunMode: RunMode;
      if ("PreparingSafe" in response.run_mode) {
        const prep = response.run_mode.PreparingSafe;
        const normalizedPreparingSafe = {
          ...prep,
          node_address: Array.isArray(
              (prep as unknown as { node_address: unknown }).node_address,
            )
            ? getEthAddress(
              (prep as unknown as { node_address: number[] }).node_address,
            )
            : prep.node_address,
        } as typeof prep;
        normalizedRunMode = { PreparingSafe: normalizedPreparingSafe };
        setState("currentScreen", "onboarding");
      } else if ("Warmup" in response.run_mode) {
        normalizedRunMode = response.run_mode;
        setState("currentScreen", "synchronization");
      } else {
        normalizedRunMode = response.run_mode; // Running
        setState("currentScreen", "main");
      }

      const normalizedAvailable = response.available_destinations.map(
        (d: unknown) => {
          const anyD = d as {
            address?: unknown;
            array?: unknown;
            meta?: Record<string, string>;
            path?: unknown;
            routing?: unknown;
          };
          const source = Array.isArray(anyD.address)
            ? anyD.address
            : Array.isArray(anyD.array)
            ? anyD.array
            : anyD.address;
          const address = typeof source === "string"
            ? source
            : getEthAddress((source ?? []) as number[]);
          // Backend may send `routing`; frontend currently expects `path` → normalize
          const path = (anyD.path ?? anyD.routing) as unknown;
          return {
            address,
            meta: (anyD.meta ?? {}) as Record<string, string>,
            path,
          } as Destination;
        },
      );

      const prefMsg = getPreferredAvailabilityChangeMessage(
        state.availableDestinations,
        normalizedAvailable,
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
          ? normalizedAvailable.some((d) =>
            d.address === settings.preferredLocation
          )
          : false;
        if (settings.preferredLocation) {
          if (nowHasPreferred) {
            const pretty = formatDestinationByAddress(
              settings.preferredLocation,
              normalizedAvailable,
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
      if (!preferredChanged) {
        logStatus(response);
      }
      setState("runMode", reconcile(normalizedRunMode));

      // Derive and update vpnStatus when it changes
      {
        const next = getVpnStatus(state);
        if (next !== state.vpnStatus) setState("vpnStatus", next);
      }
      if (
        !areDestinationsEqualUnordered(
          normalizedAvailable,
          state.availableDestinations,
        )
      ) {
        setState("availableDestinations", normalizedAvailable);
        applyDestinationSelection();
      }
      setState("error", undefined);
      // setState("fundingStatus", response.funding);

      if (preferredChanged) {
        applyDestinationSelection();
      }
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
      console.log("error", error);
      setState("isLoading", false);
      setState("runMode", null);
      setState("availableDestinations", []);
      setState("error", error instanceof Error ? error.message : String(error));
      if (state.destination !== null) setState("destination", null);
      // Ensure vpnStatus reflects service unavailability
      const next = getVpnStatus(state);
      if (next !== state.vpnStatus) setState("vpnStatus", next);
    }
  };

  const actions = {
    setScreen: (screen: AppScreen) => setState("currentScreen", screen),

    chooseDestination: (address: string | null) => {
      setState("selectedAddress", address ?? null);
      applyDestinationSelection();

      if (address && (isConnected(state) || isConnecting(state))) {
        setState("isLoading", true);
        void (async () => {
          try {
            log(`Connecting to selected exit node: ${address}`);
            await VPNService.connect(address);
            await getStatus();
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : String(error);
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
        const { address: targetAddress, reason: selectionReason } =
          selectTargetAddress(
            requestedAddress,
            settings.preferredLocation,
            state.availableDestinations,
          );

        const reasonForLog = state.selectedAddress
          ? "selected exit node"
          : selectionReason;
        log(`Connecting to ${reasonForLog}: ${targetAddress ?? "none"}`);

        if (targetAddress) {
          currentConnectionStart = Date.now();
          lastConnectedAddress = targetAddress;
          await VPNService.connect(targetAddress);
          analyticsActions.recordConnection(targetAddress, true);
        }
        await getStatus();
        applyDestinationSelection();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(message);
        setState("error", message);
        if (state.selectedAddress) {
          analyticsActions.recordConnection(state.selectedAddress, false);
        }
      } finally {
        setState("isLoading", false);
      }
    },

    disconnect: async () => {
      setState("isLoading", true);
      try {
        // Session duration will be recorded by createEffect watching vpnStatus
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

    claimAirdrop: async (secret: string) => {
      try {
        const result = await VPNService.fundingTool(secret);
        console.log("result of claimAirdrop", result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(message);
        setState("error", message);
      }
      // await getStatus();
    },
  } as const;

  return [state, actions] as const;
}

const appStore = createAppStore();

export function useAppStore(): AppStoreTuple {
  return appStore;
}
