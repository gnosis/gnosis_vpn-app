import type {
  Destination,
  DestinationState,
  ExitHealthData,
  RouteHealthState,
  RouteHealthView,
  RoutingOptions,
  SerializedSinceTime,
  SerializedTime,
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
  if (state === "NeedsFunding" || state === "Routable") return "yellow";
  if (typeof state === "object") {
    if ("Unrecoverable" in state) return "red";
    if ("NeedsPeering" in state) return "yellow";
    if ("ReadyToConnect" in state) {
      return state.ReadyToConnect.exit.health.slots.available <= 0
        ? "red"
        : "green";
    }
    if ("Connecting" in state) {
      return state.Connecting.exit.health.slots.available <= 0
        ? "red"
        : "green";
    }
  }
  return "gray";
}

/** Format SerializedTime as milliseconds. */
function toMs(serTime: SerializedTime): number {
  return serTime.secs * 1000 + serTime.nanos / 1_000_000;
}

/** Extract exit health data from a route health state, if available. */
function getExitData(state: RouteHealthState): ExitHealthData | null {
  if (typeof state === "object") {
    if ("ReadyToConnect" in state) return state.ReadyToConnect.exit;
    if ("Connecting" in state) return state.Connecting.exit;
  }
  return null;
}

/** Format one-way latency as e.g. "42 ms". Returns null when unavailable.
 * Prefers tunnel_ping_rtt once the tunnel is up; falls back to exit ping_rtt.
 * Both are round-trip times, so we halve to get one-way latency. */
export function formatLatency(rhv: RouteHealthView): string | null {
  const { state } = rhv;
  if (typeof state === "object" && "Connecting" in state) {
    const rtt = state.Connecting.tunnel_ping_rtt ??
      state.Connecting.exit.ping_rtt;
    return `${(toMs(rtt) / 2).toFixed(0)} ms`;
  }
  const exit = getExitData(state);
  if (!exit) return null;
  return `${(toMs(exit.ping_rtt) / 2).toFixed(0)} ms`;
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
  if (exit) return exit.checked_at.secs_since_epoch;

  const checkingSince: SerializedSinceTime | null = rhv.checking_since;
  return checkingSince?.secs_since_epoch ?? null;
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

/** Format "last checked" as a human-readable relative time, e.g. "2 min ago". */
export function formatLastChecked(rhv: RouteHealthView): string | null {
  const epoch = getLastCheckedEpoch(rhv);
  if (epoch === null) return null;
  const diffSec = Math.max(0, Math.round(Date.now() / 1000 - epoch));
  return formatSecondsAgo(diffSec);
}

/** Single status label for the route health state. */
export function formatExitHealthStatus(rhv: RouteHealthView): string {
  const { state } = rhv;
  if (state === "Routable") return "Checking…";
  if (state === "NeedsFunding") return "Needs funding";
  if (typeof state === "object") {
    if ("NeedsPeering" in state) return "Looking for peer";
    if ("Unrecoverable" in state) {
      const { reason } = state.Unrecoverable;
      if (reason === "NotAllowed") return "Connection not allowed";
      if (reason === "InvalidId" || reason === "InvalidPath") {
        return "Connection impossible";
      }
      if (typeof reason === "object" && "IncompatibleApiVersion" in reason) {
        return "Incompatible server version";
      }
      return "Unreachable";
    }
    if ("ReadyToConnect" in state) {
      return state.ReadyToConnect.exit.health.slots.available <= 0
        ? "Full"
        : "Ready to connect";
    }
    if ("Connecting" in state) {
      return state.Connecting.exit.health.slots.available <= 0
        ? "Full"
        : "Connecting";
    }
  }
  return "Checking…";
}

/** Whether the route is ready to connect (exit health confirmed). */
export function isReadyToConnect(rhv: RouteHealthView | undefined): boolean {
  if (!rhv) return false;
  const { state } = rhv;
  return (
    typeof state === "object" &&
    ("ReadyToConnect" in state || "Connecting" in state)
  );
}

/** Get the raw hop count from routing options. */
export function getHopCount(routing: RoutingOptions): number {
  if ("Hops" in routing) return routing.Hops;
  return routing.IntermediatePath.length;
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

/** Sort destinations by health score descending (best first). */
export function sortByHealthScore(
  available: Destination[],
  destinations: Record<string, DestinationState>,
): Destination[] {
  return [...available].sort((a, b) => {
    const dsA = destinations[a.id];
    const dsB = destinations[b.id];
    if (!dsA && !dsB) return 0;
    if (!dsA) return 1;
    if (!dsB) return -1;
    return getHealthScore(dsB) - getHealthScore(dsA);
  });
}

/** Compute a numeric quality score for sorting (higher = better). */
export function getHealthScore(ds: DestinationState): number {
  const { state } = ds.route_health;
  let score = 0;

  if (state === "NeedsFunding" || state === "Routable") return score;
  if (typeof state !== "object") return score;

  if ("Unrecoverable" in state) return score - 1000;
  if ("NeedsPeering" in state) return score;

  const exit = getExitData(state);
  if (!exit) return score;

  score += 1000;
  score += Math.min(exit.health.slots.available, 20) * 10;
  // Lower latency → higher score
  const ms = toMs(exit.ping_rtt);
  score += Math.max(0, 2000 - Math.round(ms * 4));
  const { one, nproc } = exit.health.load_avg;
  if (nproc > 0) {
    score -= Math.round((one / nproc) * 100);
  }

  return score;
}
