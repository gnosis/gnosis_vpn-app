import {
  type Destination,
  type DownPhase,
  isDeployingSafeRunMode,
  isPreparingSafeRunMode,
  isWarmupRunMode,
  StatusResponse,
  type UpPhase,
} from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import { formatExitHealthStatus } from "@src/utils/exitHealth.ts";

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
    response.connected === null &&
    response.connecting === null &&
    response.reconnecting === null &&
    response.disconnecting.length === 0 &&
    // A parked reconnect target means the daemon still intends to reconnect.
    response.target_destination === null
  );
}

export function isServiceUnavailable(state: AppState): boolean {
  return !state.runMode;
}

export function isConnectedTo(
  state: AppState,
  destination: Destination,
): boolean {
  return state.connected?.destination_id === destination.id;
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
  if ("Restarting" === response.run_mode) return "WorkerRestarting";
  if (isPreparingSafeRunMode(response.run_mode)) return "PreparingSafe";
  if (isDeployingSafeRunMode(response.run_mode)) return "DeployingSafe";
  if (isWarmupRunMode(response.run_mode)) {
    return response.run_mode.Warmup.status;
  }
  if ("Running" in response.run_mode) {
    if (response.reconnecting) return "Reconnecting";
    if (response.connected) return "Connected";
    if (response.connecting) return "Connecting";
    if (response.disconnecting.length > 0) return "Disconnecting";
    // Target kept with nothing in flight: still reconnecting, retried on route health.
    if (response.target_destination !== null) return "Reconnecting";
    return "Disconnected";
  }

  return "ServiceUnavailable";
}

export function isXDAITransferred(state: AppState): boolean {
  if (!state || !isPreparingSafeRunMode(state.runMode)) return false;
  const { node_xdai, balance_recommendation } = state.runMode.PreparingSafe;
  return (
    balance_recommendation !== null && node_xdai >= balance_recommendation.xdai
  );
}

export function isWxHOPRTransferred(state: AppState): boolean {
  if (!state || !isPreparingSafeRunMode(state.runMode)) return false;
  const { node_wxhopr, balance_recommendation } = state.runMode.PreparingSafe;
  return (
    balance_recommendation !== null &&
    node_wxhopr >= balance_recommendation.wxhopr
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

export function formatConnectionPhase(phase: UpPhase | DownPhase): string {
  switch (phase) {
    // UpPhase
    case "Init":
      return "Initializing";
    case "ResolvingBlokliIps":
      return "Locating network gateway";
    case "GeneratingWg":
      return "Generating WireGuard public key";
    case "OpeningBridge":
      return "Opening bridge session";
    case "RegisterWg":
      return "Registering WireGuard public key";
    case "OpeningPing":
      return "Opening ping session";
    case "GatherPeerIps":
      return "Gathering peers";
    case "KillswitchLockdown":
      return "Activating kill switch";
    case "EstablishWgTunnel":
      return "Establishing WireGuard tunnel";
    case "VerifyPing":
      return "Verifying destination ping";
    case "AdjustToMain":
      return "Adjusting for traffic throughput";
    case "ConnectionEstablished":
      return "Connection established";
    // DownPhase
    case "Disconnecting":
      return "Disconnecting";
    case "UnregisterWg":
      return "Unregistering WireGuard public key";
    case "ClosingBridge":
      return "Closing bridge session";
  }
}

/** Why a reconnect is waiting, from the route health the status already carries. */
export function waitingForRouteMessage(
  state: AppState,
  destinationId: string,
): string {
  const destState = state.destinations[destinationId];
  const label = destState
    ? destinationLabel(destState.destination)
    : destinationId;
  const health = destState?.route_health;
  if (health && health.state.state === "Unrecoverable") {
    return `Route to ${label}: ${formatExitHealthStatus(health)}`;
  }
  return `Waiting for route to ${label}`;
}
