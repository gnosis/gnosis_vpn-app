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

/** Sum byte_capacity across all capacity allocations plus the node EOA. */
export function computeEffectiveCredit(balance: BalanceResponse): bigint {
  const node = balance.node_capacity
    ? BigInt(balance.node_capacity.byte_capacity)
    : 0n;
  return (balance.capacity_allocations ?? []).reduce(
    (sum, e) => sum + BigInt(e.capacity.byte_capacity),
    node,
  );
}

/** Sum stake across all capacity allocations plus the node EOA
 * (Safe + Peer + EOA = total wxHOPR in wxHopli). */
export function sumCapacityStake(balance: BalanceResponse): bigint {
  const node = balance.node_capacity?.stake ?? 0n;
  return (balance.capacity_allocations ?? []).reduce(
    (sum, e) => sum + e.capacity.stake,
    node,
  );
}
