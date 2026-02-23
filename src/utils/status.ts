import {
  type Destination,
  type DestinationState,
  isPreparingSafeRunMode,
  RunMode,
} from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";

function getDestinationsWithConnection(state: AppState): DestinationState[] {
  return Object.values(state.destinations) || [];
}

export function isConnected(destinations: DestinationState[]): boolean {
  return destinations.some((ds) =>
    typeof ds.connection_state === "object" &&
    "Connected" in ds.connection_state
  );
}

export function isConnecting(destinations: DestinationState[]): boolean {
  return destinations.some((ds) =>
    typeof ds.connection_state === "object" &&
    "Connecting" in ds.connection_state
  );
}

export function isDisconnecting(destinations: DestinationState[]): boolean {
  return destinations.some((ds) =>
    typeof ds.connection_state === "object" &&
    "Disconnecting" in ds.connection_state
  );
}

export function isDisconnected(destinations: DestinationState[]): boolean {
  return destinations.every((ds) => ds.connection_state === "None");
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
    ds.destination.id === destination.id
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
    ds.destination.id === destination.id
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
    ds.destination.id === destination.id
  );
  if (destState) {
    return typeof destState.connection_state === "object" &&
      "Disconnecting" in destState.connection_state;
  }
  return false;
}

export function getVpnStatus(
  runMode: RunMode,
  destinations: DestinationState[],
): AppState["vpnStatus"] {
  if (!runMode) return "ServiceUnavailable";
  if ("Shutdown" === runMode) return "ServiceUnavailable";
  if ("PreparingSafe" in runMode) return "PreparingSafe";
  if ("DeployingSafe" in runMode) return "DeployingSafe";
  if ("Warmup" in runMode) return runMode.Warmup.status;
  if ("Running" in runMode) {
    if (isConnected(destinations)) return "Connected";
    if (isConnecting(destinations)) return "Connecting";
    if (isDisconnecting(destinations)) return "Disconnecting";
    if (isDisconnected(destinations)) return "Disconnected";
  }

  return "ServiceUnavailable";
}

export function isXDAITransferred(state: AppState): boolean {
  return !!state && isPreparingSafeRunMode(state.runMode) &&
    parseFloat(state.runMode.PreparingSafe.node_xdai) >= 0.01;
}

export function isWxHOPRTransferred(state: AppState): boolean {
  return (
    !!state && isPreparingSafeRunMode(state.runMode) &&
    parseFloat(state.runMode.PreparingSafe.node_wxhopr) >= 0.01
  );
}

export function getPreparingSafeNodeAddress(
  state: AppState,
): string | undefined {
  if (isPreparingSafeRunMode(state.runMode)) {
    return state.runMode.PreparingSafe.node_address;
  }
  return undefined;
}

export type ConnectionLabel =
  | "None"
  | "Connecting"
  | "Connected"
  | "Disconnecting"
  | "Unknown";

export function getConnectionLabel(
  cs: DestinationState["connection_state"],
): ConnectionLabel {
  if (cs === "None") return "None";
  if (typeof cs === "object" && "Connecting" in cs) return "Connecting";
  if (typeof cs === "object" && "Connected" in cs) return "Connected";
  if (typeof cs === "object" && "Disconnecting" in cs) return "Disconnecting";
  return "Unknown";
}

export function getConnectionPhase(
  cs: DestinationState["connection_state"],
): string | undefined {
  if (typeof cs === "object" && "Connecting" in cs) return cs.Connecting[1];
  if (typeof cs === "object" && "Disconnecting" in cs) {
    return cs.Disconnecting[1];
  }
  return undefined;
}

export function formatConnectionPhase(phase: string): string {
  switch (phase) {
    // UpPhase
    case "Init":
      return "Initializing";
    case "GeneratingWg":
      return "Generating WireGuard public key";
    case "OpeningBridge":
      return "Opening bridge session";
    case "RegisterWg":
      return "Registering WireGuard public key";
    case "ClosingBridge":
      return "Closing bridge session";
    case "OpeningPing":
      return "Opening ping session";
    case "EstablishDynamicWgTunnel":
      return "Establishing WireGuard tunnel";
    case "FallbackGatherPeerIps":
      return "Gathering peer IPs";
    case "FallbackToStaticWgTunnel":
      return "Setting up static routing";
    case "VerifyPing":
      return "Verifying destination ping";
    case "AdjustToMain":
      return "Adjusting for traffic throughput";
    case "ConnectionEstablished":
      return "Connection established";
    // DownPhase
    case "Disconnecting":
      return "Disconnecting";
    case "DisconnectingWg":
      return "Disconnecting WireGuard tunnel";
    case "UnregisterWg":
      return "Unregistering WireGuard public key";
    default:
      return phase;
  }
}
