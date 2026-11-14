/** Returns a tap handler that fires on the `count`-th tap in a row, each within `maxGapMs` of the last. */
export function createTapSequence(
  count: number,
  maxGapMs: number,
): (nowMs: number) => boolean {
  let taps = 0;
  let lastMs = -Infinity;
  return (nowMs) => {
    taps = nowMs - lastMs <= maxGapMs ? taps + 1 : 1;
    lastMs = nowMs;
    if (taps < count) return false;
    taps = 0;
    return true;
  };
}
