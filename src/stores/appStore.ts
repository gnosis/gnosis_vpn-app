import { createStore, reconcile, type Store } from "solid-js/store";
import {
  type Destination,
  type DestinationState,
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

      const formatFundingTool = (
        ft: "NotStarted" | "InProgress" | "CompletedSuccess" | "CompletedError",
      ): string => {
        switch (ft) {
          case "NotStarted":
            return "Not started";
          case "InProgress":
            return "In progress";
          case "CompletedSuccess":
            return "Completed successfully";
          case "CompletedError":
            return "Completed with error";
        }
      };

      let normalizedRunMode: RunMode;
      if (
        typeof response.run_mode === "object" &&
        "PreparingSafe" in response.run_mode
      ) {
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
      } else if (response.run_mode === "Warmup") {
        normalizedRunMode = response.run_mode;
        setState("currentScreen", "synchronization");
      } else {
        normalizedRunMode = response.run_mode; // Running or Shutdown
        setState("currentScreen", "main");
      }

      {
        const prevTool = typeof state.runMode === "object" && state.runMode &&
            "PreparingSafe" in state.runMode
          ? state.runMode.PreparingSafe.funding_tool
          : undefined;
        const nextTool =
          typeof normalizedRunMode === "object" && normalizedRunMode &&
            "PreparingSafe" in normalizedRunMode
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

      // Log connection state changes per destination
      {
        const prevByAddress = new Map(
          state.destinations.map((p) => [p.destination.address, p]),
        );
        let didLogConnChange = false;
        const labelFor = (cs: DestinationState["connection_state"]): string => {
          if (cs === "None") return "Disconnected";
          if (typeof cs === "object" && "Connecting" in cs) return "Connecting";
          if (typeof cs === "object" && "Connected" in cs) return "Connected";
          if (typeof cs === "object" && "Disconnecting" in cs) {
            return "Disconnecting";
          }
          return "Unknown";
        };
        const phaseOf = (
          cs: DestinationState["connection_state"],
        ): string | undefined => {
          if (typeof cs === "object" && "Connecting" in cs) {
            return cs.Connecting[1];
          }
          if (typeof cs === "object" && "Disconnecting" in cs) {
            return cs.Disconnecting[1];
          }
          return undefined;
        };
        for (const next of normalizedDestinations) {
          const prev = prevByAddress.get(next.destination.address);
          if (!prev) continue;
          const prevLabel = labelFor(prev.connection_state);
          const nextLabel = labelFor(next.connection_state);
          const prevPhase = phaseOf(prev.connection_state);
          const nextPhase = phaseOf(next.connection_state);
          const labelChanged = prevLabel !== nextLabel;
          const phaseChanged =
            (nextLabel === "Connecting" || nextLabel === "Disconnecting") &&
            prevPhase !== nextPhase;
          if ((labelChanged && nextLabel !== "Unknown") || phaseChanged) {
            const where = formatDestination(next.destination);
            const display = where && where.length > 0
              ? where
              : shortAddress(getEthAddress(next.destination.address));
            const phaseSuffix = nextPhase ? ` - ${nextPhase}` : "";
            log(`${nextLabel}: ${display}${phaseSuffix}`);
            didLogConnChange = true;
          }
        }
        // If we already logged connection changes, avoid duplicating with appendStatus summary
        if (didLogConnChange) {
          // Prevent the generic status log this tick
          // by marking preferredChanged to true in this scope so the outer block won't call logStatus
          // Instead, we will gate the call below using this local flag.
        }
        // Move the decision to log status below after this block using didLogConnChange
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
      // Avoid duplicate logs: if we already logged per-destination connection changes, skip the summary
      {
        // didLogConnChange is scoped in the block above; recompute quickly here
        const hasConnChange = state.destinations.some((prev) => {
          const next = normalizedDestinations.find((d) =>
            d.destination.address === prev.destination.address
          );
          if (!next) return false;
          const prevState = prev.connection_state;
          const nextState = next.connection_state;
          if (prevState === nextState) return false;
          // Any change in label or phase counts as a change
          const prevLabel = prevState === "None"
            ? "None"
            : "Connecting" in (prevState as any)
            ? "Connecting"
            : "Connected" in (prevState as any)
            ? "Connected"
            : "Disconnecting" in (prevState as any)
            ? "Disconnecting"
            : "Unknown";
          const nextLabel = nextState === "None"
            ? "None"
            : "Connecting" in (nextState as any)
            ? "Connecting"
            : "Connected" in (nextState as any)
            ? "Connected"
            : "Disconnecting" in (nextState as any)
            ? "Disconnecting"
            : "Unknown";
          if (prevLabel !== nextLabel) return true;
          if (nextLabel === "Connecting") {
            return (prevState as any).Connecting?.[1] !==
              (nextState as any).Connecting?.[1];
          }
          if (nextLabel === "Disconnecting") {
            return (prevState as any).Disconnecting?.[1] !==
              (nextState as any).Disconnecting?.[1];
          }
          return false;
        });
        if (!preferredChanged && !hasConnChange) {
          logStatus(response);
        }
      }
      setState("runMode", reconcile(normalizedRunMode));

      // Update destinations with connection state first (needed for getVpnStatus)
      setState("destinations", normalizedDestinations);

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
      // Ensure vpnStatus reflects service unavailability
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

      // Reconnect if destination changed and we have an active connection state
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
