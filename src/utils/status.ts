import {
  type Destination,
  type DestinationState,
  PreparingSafe,
  RunMode,
} from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";

function getDestinationsWithConnection(state: AppState): DestinationState[] {
  return state.destinations || [];
}

export function isConnected(state: AppState): boolean {
  const destinations = getDestinationsWithConnection(state);
  return destinations.some((ds) =>
    typeof ds.connection_state === "object" &&
    "Connected" in ds.connection_state
  );
}

export function isConnecting(state: AppState): boolean {
  const destinations = getDestinationsWithConnection(state);
  return destinations.some((ds) =>
    typeof ds.connection_state === "object" &&
    "Connecting" in ds.connection_state
  );
}

export function isDisconnecting(state: AppState): boolean {
  const destinations = getDestinationsWithConnection(state);
  return destinations.some((ds) =>
    typeof ds.connection_state === "object" &&
    "Disconnecting" in ds.connection_state
  );
}

export function isDisconnected(state: AppState): boolean {
  const runMode: RunMode | null | undefined = state?.runMode;
  if (!runMode) return true;

  if (typeof runMode === "object" && "Running" in runMode) {
    const destinations = getDestinationsWithConnection(state);
    return destinations.every((ds) => ds.connection_state === "None");
  }

  return false;
}

export function isServiceUnavailable(state: AppState): boolean {
  return !state.runMode;
}

export function isConnectedTo(
  state: AppState,
  destination: Destination,
): boolean {
  const destinations = getDestinationsWithConnection(state);
  const destState = destinations.find((ds) =>
    ds.destination.address === destination.address
  );
  if (destState) {
    return typeof destState.connection_state === "object" &&
      "Connected" in destState.connection_state;
  }
  return false;
}

export function isConnectingTo(
  state: AppState,
  destination: Destination,
): boolean {
  const destinations = getDestinationsWithConnection(state);
  const destState = destinations.find((ds) =>
    ds.destination.address === destination.address
  );
  if (destState) {
    return typeof destState.connection_state === "object" &&
      "Connecting" in destState.connection_state;
  }
  return false;
}

export function isDisconnectingFrom(
  state: AppState,
  destination: Destination,
): boolean {
  const destinations = getDestinationsWithConnection(state);
  const destState = destinations.find((ds) =>
    ds.destination.address === destination.address
  );
  if (destState) {
    return typeof destState.connection_state === "object" &&
      "Disconnecting" in destState.connection_state;
  }
  return false;
}

export function isPreparingSafe(
  state: AppState,
): state is AppState & { runMode: { PreparingSafe: PreparingSafe } } {
  const runMode: RunMode | null | undefined = state?.runMode;
  return !!runMode && typeof runMode === "object" && "PreparingSafe" in runMode;
}

export function isWarmup(
  state: AppState,
): state is AppState & { runMode: "Warmup" } {
  const runMode: RunMode | null | undefined = state?.runMode;
  return runMode === "Warmup";
}

export function getVpnStatus(state: AppState): AppState["vpnStatus"] {
  if (!state || !state.runMode) return "ServiceUnavailable";

  if (isPreparingSafe(state)) return "PreparingSafe";
  if (isWarmup(state)) return "Warmup";
  if (state.runMode === "Shutdown") return "ServiceUnavailable";

  if (typeof state.runMode === "object" && "Running" in state.runMode) {
    if (isConnected(state)) return "Connected";
    if (isConnecting(state)) return "Connecting";
    if (isDisconnecting(state)) return "Disconnecting";
    if (isDisconnected(state)) return "Disconnected";
  }

  return "ServiceUnavailable";
}

export function isXDAITransferred(state: AppState): boolean {
  return !!state && isPreparingSafe(state) &&
    parseInt(state.runMode.PreparingSafe.node_xdai) >= 0.01;
}

export function isWxHOPRTransferred(state: AppState): boolean {
  return !!state && isPreparingSafe(state) &&
    parseInt(state.runMode.PreparingSafe.node_wxhopr) >= 0.01;
}
