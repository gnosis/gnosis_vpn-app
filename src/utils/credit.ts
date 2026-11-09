import type { BalanceResponse } from "@src/services/vpnService.ts";

export const BYTES_PER_MB = 1_048_576n;
export const BYTES_PER_GB = BYTES_PER_MB * 1024n;

/** One decimal below 100, whole up to 999; null when it would take four digits. */
function threeDigits(value: bigint, unit: bigint): string | null {
  const tenths = (value * 10n + unit / 2n) / unit;
  if (tenths < 1000n) return `${tenths / 10n}.${tenths % 10n}`;
  const whole = (value + unit / 2n) / unit;
  return whole < 1000n ? `${whole}` : null;
}

const COMPACT_SUFFIXES = ["MB", "GB", "TB", "PB", "EB", "ZB", "YB"] as const;

/** At most three digits, e.g. 999 GB, 99.9 GB, 999 MB, 99.9 MB; sized for the top bar. */
export function formatCreditCompact(creditBytes: bigint): string {
  if (creditBytes === 0n) return "0 MB";
  let unitBytes = BYTES_PER_MB;
  for (const suffix of COMPACT_SUFFIXES) {
    const label = threeDigits(creditBytes, unitBytes);
    if (label !== null) return `${label} ${suffix}`;
    unitBytes *= 1024n;
  }
  // Summed u64 allocations stay far below this.
  return "999+ YB";
}

const COUNT_SUFFIXES = ["k", "M", "B", "T"] as const;

/** At most three digits, e.g. 999, 1.0k, 99.9k, 999k, 1.2M. */
export function formatCountCompact(count: bigint): string {
  if (count < 1000n) return `${count}`;
  let unit = 1000n;
  for (const suffix of COUNT_SUFFIXES) {
    const label = threeDigits(count, unit);
    if (label !== null) return `${label}${suffix}`;
    unit *= 1000n;
  }
  // Renewals from summed u64 allocations stay far below this.
  return "999+T";
}

/** The Stage 2 design's per-exit allotment; the client does not set it aside yet. */
export const MB_PER_EXIT = 600n;

/** Whole exits the credit covers at MB_PER_EXIT each. */
export function exitsCovered(creditBytes: bigint): bigint {
  return creditBytes / (BYTES_PER_MB * MB_PER_EXIT);
}

/** Sum byte_capacity across all capacity allocations
 * (open channels + Safe + node EOA). */
export function computeEffectiveCredit(balance: BalanceResponse): bigint {
  const caps = balance.capacity_allocations;
  if (!caps) return 0n;
  return Object.values(caps.peer_allocations).reduce(
    (sum, c) => sum + BigInt(c.byte_capacity),
    BigInt(caps.node.byte_capacity) + BigInt(caps.safe.byte_capacity),
  );
}
