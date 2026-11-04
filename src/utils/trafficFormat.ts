export type RateUnit = "Mbit/s" | "MB/s";

/** Decimal units with a decimal comma, as the live traffic readout shows them ("3,8"). */
export function formatRate(bytesPerSecond: number, unit: RateUnit): string {
  const bytes = Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
    ? bytesPerSecond
    : 0;
  const value = unit === "Mbit/s" ? (bytes * 8) / 1e6 : bytes / 1e6;
  return value.toFixed(unit === "Mbit/s" ? 1 : 2).replace(".", ",");
}
