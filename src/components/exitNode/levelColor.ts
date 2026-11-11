import type { LoadLevel } from "@src/utils/exitHealth.ts";

/** Green/orange/red ramp shared by the level-graded stats (Load, Latency). */
export const levelColorClass: Record<LoadLevel, string> = {
  low: "text-text-green",
  medium: "text-text-orange",
  high: "text-text-red",
};
