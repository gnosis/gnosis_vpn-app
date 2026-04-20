import {
  type Destination,
  isDeployingSafeRunMode,
  isPreparingSafeRunMode,
  isWarmupRunMode,
  StatusResponse,
} from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";

export function isConnected(response: StatusResponse): boolean {
  return response.connected !== null;
}

export function isConnecting(response: StatusResponse): boolean {
  return response.connecting !== null;
}

export function isDisconnecting(response: StatusResponse): boolean {
  return response.disconnecting.length > 0;
}

export function isDisconnected(response: StatusResponse): boolean {
  return (
    !response.connected &&
    !response.connecting &&
    !response.disconnecting.length
  );
}

export function isServiceUnavailable(state: AppState): boolean {
  return !state.runMode;
}

export function isConnectedTo(
  state: AppState,
  destination: Destination,
): boolean {
  return state.connected === destination.id;
}

export function isConnectingTo(
  state: AppState,
  destination: Destination,
): boolean {
  return state.connecting?.destination_id === destination.id;
}

export function isDisconnectingFrom(
  state: AppState,
  destination: Destination,
): boolean {
  return state.disconnecting.some((d) => d.destination_id === destination.id);
}

export function deriveVPNStatus(
  response: StatusResponse,
): AppState["vpnStatus"] {
  if ("Shutdown" === response.run_mode) return "ServiceUnavailable";
  if ("NotRunning" === response.run_mode) return "ServiceUnavailable";
  if (isPreparingSafeRunMode(response.run_mode)) return "PreparingSafe";
  if (isDeployingSafeRunMode(response.run_mode)) return "DeployingSafe";
  if (isWarmupRunMode(response.run_mode)) {
    return response.run_mode.Warmup.status;
  }
  if ("Running" in response.run_mode) {
    if (response.connected) return "Connected";
    if (response.connecting) return "Connecting";
    if (response.disconnecting.length > 0) return "Disconnecting";
    return "Disconnected";
  }

  return "ServiceUnavailable";
}

export function isXDAITransferred(state: AppState): boolean {
  return (
    !!state &&
    isPreparingSafeRunMode(state.runMode) &&
    parseFloat(state.runMode.PreparingSafe.node_xdai) >= 0.01
  );
}

export function isWxHOPRTransferred(state: AppState): boolean {
  return (
    !!state &&
    isPreparingSafeRunMode(state.runMode) &&
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
