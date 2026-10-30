/** Decimal byte units, so a rate reads the same way as a network monitor. */
const UNITS = ["B/s", "kB/s", "MB/s", "GB/s"] as const;

export function formatRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return `0 ${UNITS[0]}`;
  }
  let value = bytesPerSecond;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : 1;
  const text = value.toFixed(digits).replace(/\.0$/, "");
  return `${text} ${UNITS[unit]}`;
}
