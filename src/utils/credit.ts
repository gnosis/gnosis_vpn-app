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
