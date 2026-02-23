import type {
  DestinationHealth,
  DestinationState,
  RoutingOptions,
  SerializedSinceTime,
  SerializedTime,
} from "@src/services/vpnService.ts";

/** Visual health color for a destination. */
export type HealthColor = "green" | "yellow" | "red" | "gray";

/** Whether the exit-health check is currently running (dot should pulse). */
export function isExitHealthRunning(dh: DestinationHealth): boolean {
  return typeof dh !== "string" && "Running" in dh;
}

/** Derive a simple color from exit-health state. */
export function getExitHealthColor(dh: DestinationHealth): HealthColor {
  if (dh === "Init") return "gray";
  if ("Running" in dh) return "yellow";
  if ("Failure" in dh) return "red";
  if ("Success" in dh) {
    const { slots } = dh.Success.health;
    if (slots.available <= 0) return "red";
    return "green";
  }
  return "gray";
}

/** Format SerializedTime as e.g. 42. */
function toMs(serTime: SerializedTime): number {
  return serTime.secs * 1000 + serTime.nanos / 1_000_000;
}

function formatMs(serTime: SerializedTime): string {
  const amount = toMs(serTime);
  return `${amount.toFixed(0)}ms`;
}

/** Format round-trip time as e.g. "42ms". Returns null when unavailable. */
export function formatLatency(dh: DestinationHealth): string | null {
  if (typeof dh === "string" || !("Success" in dh)) return null;
  return formatMs(dh.Success.round_trip_time);
}

/** Format total session + query time as e.g. "180ms". Returns null when unavailable. */
export function formatTotalTime(dh: DestinationHealth): string | null {
  if (typeof dh === "string" || !("Success" in dh)) return null;
  return formatMs(dh.Success.total_time);
}

/** Format slots as e.g. "3/10". Returns null when unavailable. */
export function formatSlots(dh: DestinationHealth): string | null {
  if (typeof dh === "string" || !("Success" in dh)) return null;
  const { available, connected } = dh.Success.health.slots;
  const total = available + connected;
  return `${available}/${total}`;
}

/** Normalized load level relative to processor count. */
export type LoadLevel = "low" | "medium" | "high";

/** Determine load level from 1-minute load average relative to nproc. */
export function getLoadLevel(dh: DestinationHealth): LoadLevel | null {
  if (typeof dh === "string" || !("Success" in dh)) return null;
  const { one, nproc } = dh.Success.health.load_avg;
  if (nproc <= 0) return null;
  const ratio = one / nproc;
  if (ratio < 0.5) return "low";
  if (ratio < 0.85) return "medium";
  return "high";
}

/** Format load averages as e.g. "0.5 / 1.2 / 0.8 (4 cores)". */
export function formatLoadAvg(dh: DestinationHealth): string | null {
  if (typeof dh === "string" || !("Success" in dh)) return null;
  const { one, five, fifteen, nproc } = dh.Success.health.load_avg;
  const fmt = (n: number) => n.toFixed(2);
  return `${fmt(one)} / ${fmt(five)} / ${fmt(fifteen)} (${nproc} cores)`;
}

/** Extract the checked-at epoch seconds from a DestinationHealth, if available. */
export function getLastCheckedEpoch(dh: DestinationHealth): number | null {
  if (typeof dh === "string") return null;

  let checkedAt: SerializedSinceTime | undefined;
  if ("Success" in dh) checkedAt = dh.Success.checked_at;
  else if ("Failure" in dh) checkedAt = dh.Failure.checked_at;
  else if ("Running" in dh) checkedAt = dh.Running.since;

  return checkedAt?.secs_since_epoch ?? null;
}

/** Format a seconds-ago diff as a human-readable relative time, e.g. "17s ago". */
export function formatSecondsAgo(diffSec: number): string {
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/** Format "last checked" as a human-readable relative time, e.g. "2 min ago". */
export function formatLastChecked(dh: DestinationHealth): string | null {
  const epoch = getLastCheckedEpoch(dh);
  if (epoch === null) return null;
  const diffSec = Math.max(0, Math.round(Date.now() / 1000 - epoch));
  return formatSecondsAgo(diffSec);
}

/** Simple status label for the exit health state. */
export function formatExitHealthStatus(dh: DestinationHealth): string {
  if (dh === "Init") return "Checking…";
  if ("Running" in dh) return "Checking…";
  if ("Failure" in dh) return "Unreachable";
  if ("Success" in dh) {
    const { available } = dh.Success.health.slots;
    if (available <= 0) return "Full";
    return "Healthy";
  }
  return "Unknown";
}

/** Get the raw hop count from routing options. */
export function getHopCount(routing: RoutingOptions): number {
  if ("Hops" in routing) return routing.Hops;
  return routing.IntermediatePath.length;
}

/** Format routing as e.g. "1 hop" */
export function formatRouting(routing: RoutingOptions): string {
  const n = getHopCount(routing);
  return n === 1 ? "1 hop" : `${n} hops`;
}

/** Compute a numeric quality score for sorting (higher = better). */
export function getHealthScore(ds: DestinationState): number {
  const { connectivity, exit_health } = ds;

  // Base score for connectivity readiness
  let score = 0;
  if (connectivity.health === "ReadyToConnect") {
    score += 1000;
  }

  // Exit health scoring
  if (typeof exit_health === "string") {
    // "Init" — no data yet, neutral
    return score;
  }
  if ("Running" in exit_health) {
    // Checking — slight positive
    return score + 1;
  }
  if ("Failure" in exit_health) {
    // Failed — penalty
    return score - 500;
  }
  if ("Success" in exit_health) {
    const { round_trip_time, health } = exit_health.Success;
    // Reward available slots
    score += Math.min(health.slots.available, 20) * 10;
    // Reward low latency (invert: lower RTT → higher score, heavy weight)
    const ms = toMs(round_trip_time);
    score += Math.max(0, 2000 - Math.round(ms * 4));
    // Penalize high load
    const { one, nproc } = health.load_avg;
    if (nproc > 0) {
      const ratio = one / nproc;
      score -= Math.round(ratio * 100);
    }
  }

  return score;
}
