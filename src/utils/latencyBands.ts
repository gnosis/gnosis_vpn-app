/** Latency bands shared by the stats, the picker bars and the picker order. One-way milliseconds. */

/** Below this a location counts as fast: the top bar band and the "Fast and ready" verdict. */
export const FAST_LATENCY_MS = 100;

/** Normalized level, graded like load. */
export type LoadLevel = "low" | "medium" | "high";

/** Latency color band: <500 low, <=1100 medium, else high. */
export function getLatencyLevel(ms: number): LoadLevel {
  if (ms < 500) return "low";
  if (ms <= 1100) return "medium";
  return "high";
}

/** Bars for a measured route, by latency alone: fast 4, low 3, medium 2, high 1. */
export function latencyBars(oneWayMs: number): 1 | 2 | 3 | 4 {
  if (oneWayMs < FAST_LATENCY_MS) return 4;
  switch (getLatencyLevel(oneWayMs)) {
    case "low":
      return 3;
    case "medium":
      return 2;
    case "high":
      return 1;
  }
}
