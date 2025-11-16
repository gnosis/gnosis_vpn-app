import { createStore, reconcile, type Store } from "solid-js/store";
import {
  type Destination,
  type DestinationState,
  formatFundingTool,
  isPreparingSafeRunMode,
  type RunMode,
  type StatusResponse,
  VPNService,
} from "@src/services/vpnService.ts";
import { useLogsStore } from "@src/stores/logsStore.ts";
import {
  areDestinationsEqualUnordered,
  formatDestination,
  formatDestinationByAddress,
  getPreferredAvailabilityChangeMessage,
  selectTargetAddress,
} from "@src/utils/destinations.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { getConnectionLabel, getConnectionPhase } from "@src/utils/status.ts";
import {
  getVpnStatus,
  isConnected,
  isConnecting,
  isDisconnecting,
} from "@src/utils/status.ts";
import { getEthAddress } from "@src/utils/address.ts";
import { shortAddress } from "@src/utils/shortAddress";

export type AppScreen = "main" | "onboarding" | "synchronization";

export interface AppState {
  currentScreen: AppScreen;
  availableDestinations: Destination[];
  destinations: DestinationState[]; // Full destination states with connection info
  isLoading: boolean;
  error?: string;
  destination: Destination | null;
  selectedAddress: string | null;
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
    destinations: [],
    isLoading: false,
    destination: null,
    selectedAddress: null,
    runMode: null,
    vpnStatus: "ServiceUnavailable",
  });

  let pollingId: ReturnType<typeof globalThis.setInterval> | undefined;
  let pollInFlight = false;

  const [settings] = useSettingsStore();
  let lastPreferredLocation: string | null = settings.preferredLocation;
  let hasInitializedPreferred = false;

  const [, logActions] = useLogsStore();
  const log = (content: string) => logActions.append(content);
  const logStatus = (response: StatusResponse) =>
    logActions.appendStatus(response);

  const applyDestinationSelection = () => {
    const available = state.availableDestinations;
    const userSelected = state.selectedAddress
      ? available.find((d) => d.address === state.selectedAddress)
      : undefined;
    if (userSelected) {
      if (state.destination?.address !== userSelected.address) {
        setState("destination", userSelected);
      }
      return;
    }

    const preferred = settings.preferredLocation
      ? available.find((d) => d.address === settings.preferredLocation)
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
      if (isPreparingSafeRunMode(response.run_mode)) {
        const prep = response.run_mode.PreparingSafe;
        const normalizedPreparingSafe = {
          ...prep,
          node_address: (() => {
            const maybe =
              (prep as { node_address: string | number[] }).node_address;
            return Array.isArray(maybe) ? getEthAddress(maybe) : maybe;
          })(),
        } as typeof prep;
        normalizedRunMode = { PreparingSafe: normalizedPreparingSafe };
        setState("currentScreen", "onboarding");
      } else if (response.run_mode === "Warmup") {
        normalizedRunMode = response.run_mode;
        setState("currentScreen", "synchronization");
      } else {
        normalizedRunMode = response.run_mode; // Running or Shutdown
        setState("currentScreen", "main");
      }

      {
        const prevTool = isPreparingSafeRunMode(state.runMode)
          ? state.runMode.PreparingSafe.funding_tool
          : undefined;
        const nextTool = isPreparingSafeRunMode(normalizedRunMode)
          ? normalizedRunMode.PreparingSafe.funding_tool
          : undefined;
        if (nextTool && nextTool !== prevTool) {
          log(`Funding Tool - ${formatFundingTool(nextTool)}`);
        }
      }

      const normalizedDestinations = response.destinations.map(
        (ds: DestinationState) => {
          const dest = ds.destination;
          const source = Array.isArray(dest.address)
            ? dest.address
            : dest.address;
          const address = typeof source === "string"
            ? source
            : getEthAddress((source ?? []) as number[]);
          return {
            ...ds,
            destination: {
              ...dest,
              address,
            },
          } as DestinationState;
        },
      );

      {
        const prevByAddress = new Map(
          state.destinations.map((p) => [p.destination.address, p]),
        );
        for (const next of normalizedDestinations) {
          const prev = prevByAddress.get(next.destination.address);
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
            const short = shortAddress(getEthAddress(next.destination.address));
            const display = where && where.length > 0
              ? `${where} - ${short}`
              : short;
            const phaseSuffix = nextPhase ? ` - ${nextPhase}` : "";
            log(`${nextLabel}: ${display}${phaseSuffix}`);
          }
        }
      }

      const normalizedAvailable = normalizedDestinations.map((ds) =>
        ds.destination
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
      {
        const hasConnChange = state.destinations.some((prev) => {
          const next = normalizedDestinations.find((d) =>
            d.destination.address === prev.destination.address
          );
          if (!next) return false;
          const prevState = prev.connection_state;
          const nextState = next.connection_state;
          if (prevState === nextState) return false;
          const prevLabel = getConnectionLabel(prevState);
          const nextLabel = getConnectionLabel(nextState);
          if (
            prevLabel !== nextLabel && nextLabel !== "None" &&
            nextLabel !== "Unknown"
          ) return true;
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
      }
      setState("runMode", reconcile(normalizedRunMode));
      setState("destinations", normalizedDestinations);

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

      if (preferredChanged) {
        applyDestinationSelection();
      }
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
      console.log("error", error);
      setState("isLoading", false);
      setState("runMode", null);
      setState("availableDestinations", []);
      setState("destinations", []);
      setState("error", error instanceof Error ? error.message : String(error));
      if (state.destination !== null) setState("destination", null);
      const next = getVpnStatus(state);
      if (next !== state.vpnStatus) setState("vpnStatus", next);
    }
  };

  const actions = {
    setScreen: (screen: AppScreen) => setState("currentScreen", screen),

    chooseDestination: (address: string | null) => {
      const previousAddress = state.selectedAddress;
      setState("selectedAddress", address ?? null);
      applyDestinationSelection();

      if (
        address &&
        address !== previousAddress &&
        (isConnected(state) || isConnecting(state) || isDisconnecting(state))
      ) {
        setState("isLoading", true);
        void (async () => {
          try {
            const selected = state.availableDestinations.find((d) =>
              d.address === address
            );
            const name = selected ? formatDestination(selected) : "";
            const short = shortAddress(getEthAddress(address));
            const pretty = name && name.length > 0
              ? `${name} - ${short}`
              : short;
            log(`Connecting to selected exit node: ${pretty}`);
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
        if (targetAddress && reasonForLog !== "selected exit node") {
          const selected = state.availableDestinations.find((d) =>
            d.address === targetAddress
          );
          const name = selected ? formatDestination(selected) : "";
          const short = shortAddress(getEthAddress(targetAddress));
          const pretty = name && name.length > 0 ? `${name} - ${short}` : short;
          log(`Connecting to ${reasonForLog}: ${pretty}`);
        }

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
        try {
          await getStatus();
        } catch (e) {
          // swallow to keep interval alive
          console.error("status polling tick failed", e);
        } finally {
          pollInFlight = false;
        }
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
        await VPNService.fundingTool(secret);
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
