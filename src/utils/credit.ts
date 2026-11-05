import type { BalanceResponse } from "@src/services/vpnService.ts";

const BYTES_PER_MB = 1_048_576n;
export const BYTES_PER_GB = BYTES_PER_MB * 1024n;
const BYTES_PER_TB = BYTES_PER_GB * 1024n;

function withThousandsSep(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatCreditUnit(
  creditBytes: bigint,
  unitBytes: bigint,
  decimals: number,
  suffix: string,
): string {
  if (decimals === 0) {
    const rounded = (creditBytes + unitBytes / 2n) / unitBytes;
    return `${withThousandsSep(rounded.toString())} ${suffix}`;
  }
  const scale = 10n ** BigInt(decimals);
  const scaled = (creditBytes * scale + unitBytes / 2n) / unitBytes;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(decimals, "0");
  return `${withThousandsSep(whole.toString())}.${fraction} ${suffix}`;
}

export function formatCredit(creditBytes: bigint): string {
  if (creditBytes >= BYTES_PER_TB) {
    return formatCreditUnit(creditBytes, BYTES_PER_TB, 2, "TB");
  }
  if (creditBytes >= BYTES_PER_GB) {
    return formatCreditUnit(creditBytes, BYTES_PER_GB, 2, "GB");
  }
  return formatCreditUnit(creditBytes, BYTES_PER_MB, 0, "MB");
}

/** One decimal below 100, whole up to 999; null when it would take four digits. */
function threeDigits(
  creditBytes: bigint,
  unitBytes: bigint,
  suffix: string,
): string | null {
  const tenths = (creditBytes * 10n + unitBytes / 2n) / unitBytes;
  if (tenths < 1000n) return `${tenths / 10n}.${tenths % 10n} ${suffix}`;
  const whole = (creditBytes + unitBytes / 2n) / unitBytes;
  return whole < 1000n ? `${whole} ${suffix}` : null;
}

/** At most three digits, e.g. 999 GB, 99.9 GB, 999 MB, 99.9 MB; sized for the top bar. */
export function formatCreditCompact(creditBytes: bigint): string {
  if (creditBytes === 0n) return "0 MB";
  return threeDigits(creditBytes, BYTES_PER_MB, "MB") ??
    threeDigits(creditBytes, BYTES_PER_GB, "GB") ??
    threeDigits(creditBytes, BYTES_PER_TB, "TB") ??
    formatCreditUnit(creditBytes, BYTES_PER_TB, 0, "TB");
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

/** Sum stake across all capacity allocations
 * (open channels + Safe + node EOA = total wxHOPR in wxHopli). */
export function sumCapacityStake(balance: BalanceResponse): bigint {
  const caps = balance.capacity_allocations;
  if (!caps) return 0n;
  return Object.values(caps.peer_allocations).reduce(
    (sum, c) => sum + c.stake,
    caps.node.stake + caps.safe.stake,
  );
}
