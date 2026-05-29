import type {
  Destination,
  DestinationState,
  ExitHealthData,
  RouteHealthState,
  RouteHealthView,
  RoutingOptions,
} from "@src/services/vpnService.ts";

/** Visual health color for a destination. */
export type HealthColor = "green" | "yellow" | "red" | "gray";

/** Whether the exit-health check is currently running (dot should pulse). */
export function isExitHealthRunning(rhv: RouteHealthView): boolean {
  return rhv.checking_since !== null;
}

/** Derive a simple color from route health state. */
export function getExitHealthColor(rhv: RouteHealthView): HealthColor {
  const { state } = rhv;
  if (state.state === "NeedsChannel" || state.state === "Routable") {
    return "yellow";
  }
  if (state.state === "Unrecoverable") return "red";
  if (state.state === "NeedsPeering") return "yellow";
  if (state.state === "ReadyToConnect") {
    return state.exit.health.slots.available <= 0 ? "red" : "green";
  }
  if (state.state === "Connecting") {
    return state.exit.health.slots.available <= 0 ? "red" : "green";
  }
  return "gray";
}

/** Extract exit health data from a route health state, if available. */
function getExitData(state: RouteHealthState): ExitHealthData | null {
  if (state.state === "ReadyToConnect") return state.exit;
  if (state.state === "Connecting") return state.exit;
  return null;
}

/** Format one-way latency as e.g. "42 ms". Returns null when unavailable.
 * Prefers tunnel_ping_rtt once the tunnel is up; falls back to exit ping_rtt.
 * Both are round-trip times, so we halve to get one-way latency. */
export function formatLatency(rhv: RouteHealthView): string | null {
  const { state } = rhv;
  if (state.state === "Connecting") {
    const rtt = state.tunnel_ping_rtt ?? state.exit.ping_rtt;
    return `${(rtt / 2).toFixed(0)} ms`;
  }
  const exit = getExitData(state);
  if (!exit) return null;
  return `${(exit.ping_rtt / 2).toFixed(0)} ms`;
}

/** Format slots as e.g. "3/10". Returns null when unavailable. */
export function formatSlots(rhv: RouteHealthView): string | null {
  const exit = getExitData(rhv.state);
  if (!exit) return null;
  const { available, connected } = exit.health.slots;
  return `${available}/${available + connected}`;
}

/** Normalized load level relative to processor count. */
export type LoadLevel = "low" | "medium" | "high";

/** Determine load level from 1-minute load average relative to nproc. */
export function getLoadLevel(rhv: RouteHealthView): LoadLevel | null {
  const exit = getExitData(rhv.state);
  if (!exit) return null;
  const { one, nproc } = exit.health.load_avg;
  if (nproc <= 0) return null;
  const ratio = one / nproc;
  if (ratio < 0.5) return "low";
  if (ratio < 0.85) return "medium";
  return "high";
}

/** Format load averages as e.g. "0.5 / 1.2 / 0.8 (4 cores)". */
export function formatLoadAvg(rhv: RouteHealthView): string | null {
  const exit = getExitData(rhv.state);
  if (!exit) return null;
  const { one, five, fifteen, nproc } = exit.health.load_avg;
  const fmt = (n: number) => n.toFixed(2);
  return `${fmt(one)} / ${fmt(five)} / ${fmt(fifteen)} (${nproc} cores)`;
}

/** Extract the checked-at epoch seconds, if available. */
export function getLastCheckedEpoch(rhv: RouteHealthView): number | null {
  const exit = getExitData(rhv.state);
  if (exit) return Math.floor(exit.checked_at / 1000);

  return rhv.checking_since !== null
    ? Math.floor(rhv.checking_since / 1000)
    : null;
}

/** Format a seconds-ago diff as a human-readable relative time, e.g. "17 s ago". */
export function formatSecondsAgo(diffSec: number): string {
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec} s ago`;
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}

/** Single status label for the route health state. */
export function formatExitHealthStatus(rhv: RouteHealthView): string {
  const { state } = rhv;
  if (state.state === "Routable") return "Checking…";
  if (state.state === "NeedsChannel") return "Needs channel";
  if (state.state === "NeedsPeering") return "Looking for peer";
  if (state.state === "Unrecoverable") {
    const { reason } = state;
    if (reason === "NotAllowed") return "Connection not allowed";
    if (reason === "InvalidPath") {
      return "Connection impossible";
    }
    if (typeof reason === "object" && "IncompatibleApiVersion" in reason) {
      return "Incompatible server version";
    }
    return "Unreachable";
  }
  if (state.state === "ReadyToConnect") {
    return state.exit.health.slots.available <= 0 ? "Full" : "Ready to connect";
  }
  if (state.state === "Connecting") {
    return state.exit.health.slots.available <= 0 ? "Full" : "Connecting";
  }
  return "Checking…";
}

/** Whether route health has displayable stats (latency, load, etc). */
export function hasHealthContent(rhv: RouteHealthView | null): boolean {
  if (!rhv) return false;
  const s = rhv.state.state;
  return s !== "NeedsChannel" && s !== "Routable" && s !== "NeedsPeering" &&
    s !== "Unrecoverable";
}

/** Whether the route is ready to connect (exit health confirmed). */
export function isReadyToConnect(rhv: RouteHealthView | undefined): boolean {
  if (!rhv) return false;
  const s = rhv.state.state;
  return s === "ReadyToConnect" || s === "Connecting";
}

/** Get the raw hop count from routing options. */
export function getHopCount(routing: RoutingOptions): number {
  return routing.Hops;
}

/** Format routing as e.g. "1-hop" */
export function formatRouting(routing: RoutingOptions): string {
  const n = getHopCount(routing);
  return n === 1 ? "1-hop" : `${n}-hops`;
}

/** Largest hop count across all available destinations, minimum 1. */
export function getMaxHopCount(destinations: Destination[]): number {
  if (destinations.length === 0) return 1;
  return Math.max(1, ...destinations.map((d) => getHopCount(d.routing)));
}

/** Latency ms for a ReadyToConnect/Connecting destination; null otherwise. */
export function getSortLatencyMs(ds: DestinationState): number | null {
  const rh = ds.route_health;
  if (!rh) return null;
  const { state } = rh;
  if (state.state === "Connecting") {
    return state.tunnel_ping_rtt ?? state.exit.ping_rtt;
  }
  if (state.state === "ReadyToConnect") {
    return state.exit.ping_rtt;
  }
  return null;
}

export type ConnectionState =
  | "Connected"
  | "Connecting"
  | "Disconnecting"
  | "None";

export function getConnectionState(
  destId: string,
  connected: string | null | undefined,
  connectingId: string | undefined,
  disconnecting: { destination_id: string }[],
): ConnectionState {
  if (connected === destId) return "Connected";
  if (connectingId === destId) return "Connecting";
  if (disconnecting.some((d) => d.destination_id === destId)) {
    return "Disconnecting";
  }
  return "None";
}
