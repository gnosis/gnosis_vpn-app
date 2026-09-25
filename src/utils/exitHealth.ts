import type { Destination, RouteHealthView } from "@src/services/vpnService.ts";
import type { ExitData } from "@src/utils/destinations.ts";

/** Visual health color for a destination; "default" renders as plain text. */
export type HealthColor = "green" | "yellow" | "red" | "gray" | "default";

/** The walk's verdict on this destination, with exit data tightening a full-value route. */
type RouteVerdict =
  | "checking"
  | "ready"
  | "full"
  | "weak"
  | "no-route"
  | "unrecoverable";

function routeVerdict(
  rhv: RouteHealthView,
  exit: ExitData | null,
): RouteVerdict {
  const { state, walk } = rhv;
  if (state.state === "Unrecoverable") return "unrecoverable";
  if (walk === null) return "checking";
  if (state.state === "NotRoutable" || walk.found !== "Paths") {
    return "no-route";
  }
  if (walk.best_value < 1) return "weak";
  if (exit !== null && exit.slots.available <= 0) return "full";
  return "ready";
}

/** Green is connectable, red is a dead end, yellow needs a look; the rest is routine. */
export function getExitHealthColor(
  rhv: RouteHealthView,
  exit: ExitData | null,
): HealthColor {
  switch (routeVerdict(rhv, exit)) {
    case "ready":
      return "green";
    case "full":
    case "unrecoverable":
      return "red";
    case "weak":
      return "yellow";
    case "checking":
    case "no-route":
      return "default";
  }
}

/** Single status label for the route health state. */
export function formatExitHealthStatus(
  rhv: RouteHealthView,
  exit: ExitData | null,
): string {
  switch (routeVerdict(rhv, exit)) {
    case "ready":
      return "Ready to connect";
    case "full":
      return "Full";
    case "weak":
      return "Weak route";
    case "no-route":
      return "No route";
    case "checking":
      return "Checking…";
    case "unrecoverable":
      return formatUnrecoverable(rhv);
  }
}

function formatUnrecoverable(rhv: RouteHealthView): string {
  if (rhv.state.state !== "Unrecoverable") return "Unreachable";
  const { reason } = rhv.state;
  if (reason === "NotAllowed") return "Connection not allowed";
  if ("IncompatibleApiVersion" in reason) return "Incompatible server version";
  return "Unreachable";
}

/** One-way latency in whole ms, as displayed; the tunnel's own sample wins once it exists. */
export function getLatencyMs(
  exit: ExitData | null,
  tunnelPingRtt: number | null,
): number | null {
  const rtt = tunnelPingRtt ?? exit?.rtt ?? null;
  return rtt === null ? null : Math.round(rtt / 2);
}

/** Format one-way latency as e.g. "42 ms". Returns null when unavailable. */
export function formatLatency(
  exit: ExitData | null,
  tunnelPingRtt: number | null,
): string | null {
  const ms = getLatencyMs(exit, tunnelPingRtt);
  return ms === null ? null : `${ms} ms`;
}

/** Share of an exit's connection slots currently in use. */
export interface SlotLoad {
  used: number;
  total: number;
  /** Whole-number percentage of slots in use, 0–100. */
  percent: number;
}

/** Slot usage as a percentage. Null when unavailable or the exit has no slots. */
export function getSlotLoad(exit: ExitData | null): SlotLoad | null {
  if (!exit) return null;
  const { total, connected } = exit.slots;
  if (total <= 0) return null;
  return {
    used: connected,
    total,
    percent: Math.round((connected / total) * 100),
  };
}

/** Normalized load level relative to processor count. */
export type LoadLevel = "low" | "medium" | "high";

/** Slot-usage color band: <=50 low, <=75 medium, else high. */
export function getSlotLoadLevel(percent: number): LoadLevel {
  if (percent <= 50) return "low";
  if (percent <= 75) return "medium";
  return "high";
}

/** Latency color band, graded like load: <500 low, <=1100 medium, else high. */
export function getLatencyLevel(ms: number): LoadLevel {
  if (ms < 500) return "low";
  if (ms <= 1100) return "medium";
  return "high";
}

/** Determine load level from 1-minute load average relative to nproc. */
export function getLoadLevel(exit: ExitData | null): LoadLevel | null {
  if (!exit) return null;
  const { one, nproc } = exit.loadAvg;
  if (nproc <= 0) return null;
  const ratio = one / nproc;
  if (ratio < 0.5) return "low";
  if (ratio < 0.85) return "medium";
  return "high";
}

/** Format load averages as e.g. "0.5 / 1.2 / 0.8 (4 cores)". */
export function formatLoadAvg(exit: ExitData | null): string | null {
  if (!exit) return null;
  const { one, five, fifteen, nproc } = exit.loadAvg;
  const fmt = (n: number) => n.toFixed(2);
  return `${fmt(one)} / ${fmt(five)} / ${fmt(fifteen)} (${nproc} cores)`;
}

/** When the exit was last measured, in epoch seconds; else when the route was last walked. */
export function getLastCheckedEpoch(
  rhv: RouteHealthView,
  exit: ExitData | null,
): number | null {
  if (exit) return Math.floor(exit.checkedAt / 1000);
  const walkedAt = rhv.walk?.walked_at;
  return walkedAt === undefined ? null : Math.floor(walkedAt / 1000);
}

/** The best path's value as a percentage, e.g. "100%"; null before the first walk. */
export function formatPathValue(rhv: RouteHealthView): string | null {
  const walk = rhv.walk;
  if (walk?.found !== "Paths") return null;
  return `${Math.round(walk.best_value * 100)}%`;
}

/** Distinct first relays over the paths found, e.g. "3 of 5"; null before the first walk. */
export function formatRelays(rhv: RouteHealthView): string | null {
  const walk = rhv.walk;
  if (walk?.found !== "Paths") return null;
  return `${walk.distinct_first_relays} of ${walk.count}`;
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

/** Whether the card has route stats to show: anything the walk found. */
export function hasHealthContent(rhv: RouteHealthView | null): boolean {
  return rhv?.walk?.found === "Paths";
}

/** Get the raw hop count from routing. */
export function getHopCount(routing: number): number {
  return routing;
}

/** Format routing as e.g. "1-hop" */
export function formatRouting(routing: number): string {
  const n = getHopCount(routing);
  return n === 1 ? "1-hop" : `${n}-hops`;
}

/** Largest hop count across all available destinations, minimum 1. */
export function getMaxHopCount(destinations: Destination[]): number {
  if (destinations.length === 0) return 1;
  return Math.max(1, ...destinations.map((d) => getHopCount(d.routing)));
}

export type ConnectionState =
  | "Connected"
  | "Connecting"
  | "Reconnecting"
  | "Disconnecting"
  | "None";

/** User-facing connection status for the detail panel's Status stat. */
export function formatConnectionStatus(state: ConnectionState): string {
  if (state === "Connected") return "Connected";
  if (state === "Connecting" || state === "Reconnecting") return "Connecting";
  // Treat disconnecting as already disconnected to match ExitHealthDetail.
  return "Disconnected";
}

export function getConnectionState(
  destId: string,
  connected: string | null | undefined,
  connectingId: string | undefined,
  reconnectingId: string | undefined,
  disconnecting: { destination_id: string }[],
): ConnectionState {
  if (connected === destId) return "Connected";
  if (connectingId === destId) return "Connecting";
  if (reconnectingId === destId) return "Reconnecting";
  if (disconnecting.some((d) => d.destination_id === destId)) {
    return "Disconnecting";
  }
  return "None";
}
