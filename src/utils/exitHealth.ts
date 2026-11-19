import type { Destination, RouteHealthView } from "@src/services/vpnService.ts";
import type { ExitData } from "@src/utils/destinations.ts";

/** The daemon's verdict on this destination, with exit data tightening a routable one. */
type RouteVerdict =
  | "checking"
  | "ready"
  | "full"
  | "no-route"
  | "unrecoverable";

function routeVerdict(
  rhv: RouteHealthView,
  exit: ExitData | null,
): RouteVerdict {
  const { state, walked_at } = rhv;
  if (state.type === "unrecoverable") return "unrecoverable";
  if (walked_at === null) return "checking";
  if (state.type === "not_routable") return "no-route";
  if (exit !== null && exit.slots.available <= 0) return "full";
  return "ready";
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
    case "no-route":
      return "No route";
    case "checking":
      return "Checking…";
    case "unrecoverable":
      return formatUnrecoverable(rhv);
  }
}

function formatUnrecoverable(rhv: RouteHealthView): string {
  if (rhv.state.type !== "unrecoverable") return "Unreachable";
  switch (rhv.state.reason.type) {
    case "not_allowed":
      return "Connection not allowed";
    case "incompatible_api_version":
      return "Incompatible server version";
    case "cannot_open_session":
      return "Cannot open session";
  }
}

/** One-way latency in whole ms, as displayed; the tunnel's own sample wins once it exists. */
export function getLatencyMs(
  exit: ExitData | null,
  tunnelPingRtt: number | null,
): number | null {
  const rtt = tunnelPingRtt ?? exit?.rtt ?? null;
  return rtt === null ? null : Math.round(rtt / 2);
}

/** Latency as "1,234 ms", or seconds past 9,999 ms ("12.3 s", "123 s"): never wider than "9,999 ms". */
export function formatLatency(ms: number): string {
  if (ms <= 9999) return `${ms.toLocaleString("en")} ms`;
  const digits = ms < 100_000 ? 1 : 0;
  return `${
    (ms / 1000).toLocaleString("en", { maximumFractionDigits: digits })
  } s`;
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
  return rhv.walked_at === null ? null : Math.floor(rhv.walked_at / 1000);
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

/** Get the raw hop count. */
export function getHopCount(hops: number): number {
  return hops;
}

/** Format hops as e.g. "1 hop" */
export function formatRouting(hops: number): string {
  const n = getHopCount(hops);
  return n === 1 ? "1 hop" : `${n} hops`;
}

/** Largest hop count across all available destinations, minimum 1. */
export function getMaxHopCount(destinations: Destination[]): number {
  if (destinations.length === 0) return 1;
  return Math.max(1, ...destinations.map((d) => getHopCount(d.hops)));
}
