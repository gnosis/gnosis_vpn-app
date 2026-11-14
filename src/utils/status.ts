import {
  type Destination,
  isDeployingSafeRunMode,
  isPreparingSafeRunMode,
  isRunningRunMode,
  type RunMode,
  StatusResponse,
  type TunnelStall,
  warmupProgress,
} from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";
import { exitDisplayName, getExitData } from "@src/utils/destinations.ts";
import { formatExitHealthStatus } from "@src/utils/exitHealth.ts";

export function isConnected(response: StatusResponse): boolean {
  return response.connection.type === "connected";
}

export function isConnecting(response: StatusResponse): boolean {
  return response.connection.type === "connecting";
}

export function isDisconnecting(response: StatusResponse): boolean {
  return response.disconnecting.length > 0;
}

export function isDisconnected(response: StatusResponse): boolean {
  return (
    response.connection.type === "disconnected" &&
    response.disconnecting.length === 0 &&
    // A parked target means the daemon still intends to connect.
    response.target === null
  );
}

export function isServiceUnavailable(state: AppState): boolean {
  return !state.runMode;
}

export function isConnectedTo(
  state: AppState,
  destination: Destination,
): boolean {
  const c = state.connection;
  return c.type === "connected" && c.destination === destination.id;
}

export function isConnectingTo(
  state: AppState,
  destination: Destination,
): boolean {
  const c = state.connection;
  return c.type === "connecting" && c.destination === destination.id;
}

export function isDisconnectingFrom(
  state: AppState,
  destination: Destination,
): boolean {
  return state.disconnecting.some((d) => d.destination === destination.id);
}

export function deriveVPNStatus(
  response: StatusResponse,
): AppState["vpnStatus"] {
  const runMode = response.run_mode;
  if (runMode.type === "shutdown") return "ServiceUnavailable";
  if (runMode.type === "not_running") return "ServiceUnavailable";
  if (runMode.type === "restarting") return "WorkerRestarting";
  if (isPreparingSafeRunMode(runMode)) return "PreparingSafe";
  if (isDeployingSafeRunMode(runMode)) return "DeployingSafe";
  const warmup = warmupProgress(runMode);
  if (warmup) return warmup.stage;
  if (!isRunningRunMode(runMode)) return "ServiceUnavailable";

  switch (response.connection.type) {
    case "reconnecting":
      return "Reconnecting";
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
  }
  if (response.disconnecting.length > 0) return "Disconnecting";
  // Target kept with nothing in flight: a connect waiting on route health.
  if (response.target !== null) return "Reconnecting";
  return "Disconnected";
}

export interface ConnectButtonLook {
  label: "Connect" | "Cancel" | "Disconnect";
  variant: "connect" | "stop";
}

/** "Disconnect" would imply a usable tunnel, so the whole attempt reads "Cancel". */
export function connectButtonLook(
  vpnStatus: string,
  targetDestination: string | null,
  isReconnecting: boolean,
): ConnectButtonLook {
  // Restoring a tunnel that existed: the tunnel is what the button gives up, not an attempt.
  if (isReconnecting) return { label: "Disconnect", variant: "stop" };
  if (vpnStatus === "Connected") {
    return { label: "Disconnect", variant: "stop" };
  }

  const waitingForRoute = vpnStatus === "Reconnecting" &&
    targetDestination !== null;
  const attemptInFlight = vpnStatus === "Connecting" ||
    isSwitchingDestination(vpnStatus, targetDestination) || waitingForRoute;
  if (attemptInFlight) return { label: "Cancel", variant: "stop" };
  return { label: "Connect", variant: "connect" };
}

/** A switch tears the old tunnel down before the new attempt starts, so it reports as a disconnect. */
export function isSwitchingDestination(
  vpnStatus: string,
  targetDestination: string | null,
): boolean {
  return vpnStatus === "Disconnecting" && targetDestination !== null;
}

/** Why a reconnect is waiting, from the route health the status already carries. */
export function waitingForRouteMessage(
  state: AppState,
  destinationId: string,
): string {
  const destState = state.destinations[destinationId];
  const label = destState
    ? exitDisplayName(destState.destination)
    : destinationId;
  const health = destState?.route_health;
  if (destState && health && health.state.type === "unrecoverable") {
    const exit = getExitData(destState, state.probe);
    return `Route to ${label}: ${formatExitHealthStatus(health, exit)}`;
  }
  return `Waiting for route to ${label}`;
}

function formatDurationShort(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h`;
}

/** Bottom-line suffix, mirrors the CLI: "stalled 18 s (2/3)". */
export function formatStall(stall: TunnelStall, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - stall.since) / 1000));
  return `stalled ${
    formatDurationShort(sec)
  } (${stall.failed_pings}/${stall.reconnect_at})`;
}

/** Warning while the daemon's channel maintenance is down, null otherwise. */
export function channelMaintenanceWarning(
  runMode: RunMode | null,
  nowMs: number,
): string | null {
  if (!isRunningRunMode(runMode)) return null;
  const maintenance = runMode.channel_maintenance;
  if (maintenance.type !== "unavailable") return null;
  const sec = Math.max(0, Math.floor((nowMs - maintenance.since) / 1000));
  return `Channel maintenance down for ${
    formatDurationShort(sec)
  } — tunnel may degrade`;
}
