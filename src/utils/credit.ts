import type {
  BalanceResponse,
  Capacity,
  PixChunkStats,
} from "@src/services/vpnService.ts";

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

/** Whole exits the credit covers at one PIX chunk each. */
export function exitsCovered(creditBytes: bigint, chunkBytes: bigint): bigint {
  if (chunkBytes === 0n) return 0n;
  return creditBytes / chunkBytes;
}

/** The live tunnel's data left: "Free" before the exit asks for a chunk, "—" while unmeasured. */
export function formatDataLeft(pix: PixChunkStats): string {
  if (pix.phase === "free") return "Free";
  if (pix.bytes_left === null) return "—";
  return formatCreditCompact(BigInt(pix.bytes_left));
}

/** Unspent share of the chunks bought; full while nothing is bought or measured yet. */
export function dataLeftFraction(pix: PixChunkStats): number {
  const unmeasured = pix.bytes_left === null || pix.bytes_bought === 0;
  if (unmeasured) return 1;
  return Math.min(1, pix.bytes_left! / pix.bytes_bought);
}

/** wxHOPR held across open channels, the Safe, the node EOA and the PIX float. */
export function sumCapacityStake(balance: BalanceResponse): bigint {
  const caps = balance.capacity_allocations;
  if (!caps) return 0n;
  return Object.values(caps.peer_allocations).reduce(
    (sum, c) => sum + c.stake,
    caps.node.stake + caps.safe.stake + caps.pix_float.stake,
  );
}

/** Sum byte_capacity across all capacity allocations
 * (open channels + Safe + node EOA + PIX float). */
export function computeEffectiveCredit(balance: BalanceResponse): bigint {
  const caps = balance.capacity_allocations;
  if (!caps) return 0n;
  return Object.values(caps.peer_allocations).reduce(
    (sum, c) => sum + BigInt(c.byte_capacity),
    BigInt(caps.node.byte_capacity) + BigInt(caps.safe.byte_capacity) +
      BigInt(caps.pix_float.byte_capacity),
  );
}

/** One line of {@link creditBreakdown}: an allocation, a sum of the lines above it, or an aside outside the sums. */
export interface CreditLine {
  label: string;
  bytes: bigint;
  stake: bigint;
  kind: "part" | "sum" | "aside";
}

/** A PIX chunk's size and price, to value the float at what exits charge. */
export interface PixChunkPrice {
  bytes: bigint;
  cost: bigint;
}

/** Each allocation with the totals without and with the PIX float, then the float at the PIX price; null before allocations arrive. */
export function creditBreakdown(
  balance: BalanceResponse,
  chunk: PixChunkPrice | null,
): CreditLine[] | null {
  const caps = balance.capacity_allocations;
  if (!caps) return null;
  const line = (
    label: string,
    parts: Capacity[],
    kind: CreditLine["kind"] = "part",
  ): CreditLine => ({
    label,
    bytes: parts.reduce((total, c) => total + BigInt(c.byte_capacity), 0n),
    stake: parts.reduce((total, c) => total + c.stake, 0n),
    kind,
  });
  const channels = Object.values(caps.peer_allocations);
  const held = [caps.node, caps.safe, ...channels];
  const lines = [
    line("EOA", [caps.node]),
    line("Safe", [caps.safe]),
    line("Channels", channels),
    line("Without PIX pool", held, "sum"),
    line("PIX pool", [caps.pix_float]),
    line("Total", [...held, caps.pix_float], "sum"),
  ];
  if (chunk && chunk.cost > 0n) {
    lines.push({
      label: "PIX pool at PIX price",
      bytes: caps.pix_float.stake * chunk.bytes / chunk.cost,
      stake: caps.pix_float.stake,
      kind: "aside",
    });
  }
  return lines;
}

/** Two decimals in GB, or in MB below one GB. */
export function formatCreditPrecise(creditBytes: bigint): string {
  const [unit, suffix] = creditBytes < BYTES_PER_GB
    ? [BYTES_PER_MB, "MB"]
    : [BYTES_PER_GB, "GB"];
  const hundredths = (creditBytes * 100n + unit / 2n) / unit;
  return `${hundredths / 100n}.${
    String(hundredths % 100n).padStart(2, "0")
  } ${suffix}`;
}
