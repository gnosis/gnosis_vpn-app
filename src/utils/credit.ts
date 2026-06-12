import type { CapacityEntry } from "@src/services/vpnService.ts";

const BYTES_PER_MB = 1_048_576n;
const BYTES_PER_GB = BYTES_PER_MB * 1024n;
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

// 1 wxHOPR = 0.095 GB = 19/200 * BYTES_PER_GB bytes (temporary conversion rate)
// Balances are denominated in wxHopli: 1 wxHOPR = 1e18 wxHopli
const WXHOPLI_PER_WXHOPR = 10n ** 18n;
const BYTES_PER_WXHOPR = (19n * BYTES_PER_GB) / 200n;

/** Temporary workaround: estimate traffic bytes from a wxHopli balance at 1 wxHOPR = 0.095 GB. */
export function estimateCreditFromWxHopli(wxHopli: bigint): bigint {
  return (wxHopli * BYTES_PER_WXHOPR) / WXHOPLI_PER_WXHOPR;
}

/** Sum byte_capacity across all capacity allocations. */
export function computeEffectiveCredit(entries: CapacityEntry[]): bigint {
  return entries.reduce(
    (sum, e) => sum + BigInt(e.capacity.byte_capacity),
    0n,
  );
}

/** Sum stake across all capacity allocations (Safe + Peer = total wxHOPR in wxHopli). */
export function sumCapacityStake(entries: CapacityEntry[]): bigint {
  return entries.reduce(
    (sum, e) => sum + BigInt(e.capacity.stake),
    0n,
  );
}
