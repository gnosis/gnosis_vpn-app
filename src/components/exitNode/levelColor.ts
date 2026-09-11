import type { LoadLevel } from "@src/utils/exitHealth.ts";

/** Green/orange/red ramp shared by the level-graded stats (Load, Latency). */
export const levelColorClass: Record<LoadLevel, string> = {
  low: "text-vpn-light-green",
  medium: "text-vpn-orange",
  high: "text-vpn-red",
};

/** `Stat` valueClass for a level-graded value, so they all render alike. */
export function levelValueClass(level: LoadLevel): string {
  return `font-semibold ${levelColorClass[level]}`;
}
