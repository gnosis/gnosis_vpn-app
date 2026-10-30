/** Sync progress as shown: rounded down so it never reads 100 early, to hundredths when `withDecimals`. */
export function syncProgressDigits(
  progress: number,
  withDecimals: boolean,
): { whole: string; fraction: string | null } {
  const clamped = Math.min(100, progress);
  if (!withDecimals) {
    return { whole: String(Math.floor(clamped)), fraction: null };
  }
  // The epsilon keeps float error from flooring e.g. 0.29 to 0.28.
  const [whole, fraction] = (Math.floor(clamped * 100 + 1e-6) / 100)
    .toFixed(2)
    .split(".");
  return { whole, fraction };
}
