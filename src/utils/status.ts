import { type Destination, type DestinationState, PreparingSafe, RunMode } from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";

// Helper to get destinations with connection state from AppState
function getDestinationsWithConnection(state: AppState): DestinationState[] {
  return state.destinations || [];
}

export function isConnected(state: AppState): boolean {
  const destinations = getDestinationsWithConnection(state);
  if (destinations.length > 0) {
    return destinations.some(ds => typeof ds.connection_state === "object" && "Connected" in ds.connection_state);
  }
  // Fallback to vpnStatus if destinations not available
  return state.vpnStatus === "Connected";
}

export function isConnecting(state: AppState): boolean {
  const destinations = getDestinationsWithConnection(state);
  if (destinations.length > 0) {
    return destinations.some(ds => typeof ds.connection_state === "object" && "Connecting" in ds.connection_state);
  }
  // Fallback to vpnStatus if destinations not available
  return state.vpnStatus === "Connecting";
}

export function isDisconnecting(state: AppState): boolean {
  const destinations = getDestinationsWithConnection(state);
  if (destinations.length > 0) {
    return destinations.some(ds => typeof ds.connection_state === "object" && "Disconnecting" in ds.connection_state);
  }
  // Fallback to vpnStatus if destinations not available
  return state.vpnStatus === "Disconnecting";
}

export function isDisconnected(state: AppState): boolean {
  const runMode: RunMode | null | undefined = state?.runMode;
  if (!runMode) return true;

  // If Running, check if all destinations have "None" connection state
  if (typeof runMode === "object" && "Running" in runMode) {
    const destinations = getDestinationsWithConnection(state);
    if (destinations.length > 0) {
      return destinations.every(ds => ds.connection_state === "None");
    }
  }

  // Fallback to vpnStatus
  return state.vpnStatus === "Disconnected";
}

export function isServiceUnavailable(state: AppState): boolean {
  return !state.runMode || state.vpnStatus === "ServiceUnavailable";
}

export function isConnectedTo(state: AppState, destination: Destination): boolean {
  const destinations = getDestinationsWithConnection(state);
  const destState = destinations.find(ds => ds.destination.address === destination.address);
  if (destState) {
    return typeof destState.connection_state === "object" && "Connected" in destState.connection_state;
  }
  return isConnected(state) && state.destination?.address === destination.address;
}

export function isConnectingTo(state: AppState, destination: Destination): boolean {
  const destinations = getDestinationsWithConnection(state);
  const destState = destinations.find(ds => ds.destination.address === destination.address);
  if (destState) {
    return typeof destState.connection_state === "object" && "Connecting" in destState.connection_state;
  }
  return isConnecting(state) && state.destination?.address === destination.address;
}

export function isDisconnectingFrom(state: AppState, destination: Destination): boolean {
  const destinations = getDestinationsWithConnection(state);
  const destState = destinations.find(ds => ds.destination.address === destination.address);
  if (destState) {
    return typeof destState.connection_state === "object" && "Disconnecting" in destState.connection_state;
  }
  return isDisconnecting(state) && state.destination?.address === destination.address;
}

export function isPreparingSafe(state: AppState): state is AppState & { runMode: { PreparingSafe: PreparingSafe } } {
  const runMode: RunMode | null | undefined = state?.runMode;
  return !!runMode && typeof runMode === "object" && "PreparingSafe" in runMode;
}

export function isWarmup(state: AppState): state is AppState & { runMode: "Warmup" } {
  const runMode: RunMode | null | undefined = state?.runMode;
  return runMode === "Warmup";
}

export function getVpnStatus(state: AppState): AppState["vpnStatus"] {
  if (!state || !state.runMode) return "ServiceUnavailable";

  // Check run mode first
  if (isPreparingSafe(state)) return "PreparingSafe";
  if (isWarmup(state)) return "Warmup";
  if (state.runMode === "Shutdown") return "ServiceUnavailable";

  // For Running state, check connection status from destinations
  if (typeof state.runMode === "object" && "Running" in state.runMode) {
    if (isConnected(state)) return "Connected";
    if (isConnecting(state)) return "Connecting";
    if (isDisconnecting(state)) return "Disconnecting";
    if (isDisconnected(state)) return "Disconnected";
  }

  return "ServiceUnavailable";
}

function bigintStringGreaterThanZero(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const n = BigInt(value);
    return n > 0n;
  } catch {
    return false;
  }
}

export function isXDAITransferred(state: AppState): boolean {
  return (
    !!state &&
    isPreparingSafe(state) &&
    bigintStringGreaterThanZero((state.runMode.PreparingSafe as unknown as { node_xdai: unknown }).node_xdai)
  );
}

export function isWxHOPRTransferred(state: AppState): boolean {
  return (
    !!state &&
    isPreparingSafe(state) &&
    bigintStringGreaterThanZero((state.runMode.PreparingSafe as unknown as { node_wxhopr: unknown }).node_wxhopr)
  );
}
