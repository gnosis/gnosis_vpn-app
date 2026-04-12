const PAYLOAD_PER_MESSAGE = 650n; // bytes per HOPR message (spec constant)
const BYTES_PER_GB = 2n ** 30n; // 1,073,741,824 bytes

/**
 * Compute remaining credit in bytes from channel balance and ticket value.
 * Both inputs are wei amounts as decimal strings (18 decimals).
 * Returns 0n if ticket_value is zero or inputs are invalid.
 */
export function computeCreditBytes(
  channelsOut: string,
  ticketValue: string,
): bigint {
  try {
    const ch = BigInt(channelsOut.trim() || "0");
    const tv = BigInt(ticketValue.trim() || "0");
    if (tv === 0n || ch === 0n) return 0n;
    const messages = ch / tv;
    return messages * PAYLOAD_PER_MESSAGE;
  } catch {
    return 0n;
  }
}

const BYTES_PER_TB = BYTES_PER_GB * 1024n;

/**
 * Format credit bytes as a human-readable string.
 * Scales from MB up through GB and TB.
 */
export function formatCredit(creditBytes: bigint): string {
  if (creditBytes >= BYTES_PER_TB) {
    return `${(Number(creditBytes) / Number(BYTES_PER_TB)).toFixed(2)} TB`;
  }
  if (creditBytes >= BYTES_PER_GB) {
    return `${(Number(creditBytes) / Number(BYTES_PER_GB)).toFixed(2)} GB`;
  }
  return `${(Number(creditBytes) / 1_048_576).toFixed(0)} MB`;
}

/**
 * Compute the HOPR-per-GB rate from ticket_value (wei string).
 * Formula: (2^30 / 650) * ticket_value_readable
 * Returns a human-readable string like "110.00".
 */
export function computeHoprPerGb(ticketValue: string): string {
  try {
    const tv = BigInt(ticketValue.trim() || "0");
    if (tv === 0n) return "—";
    const perGbWei = (BYTES_PER_GB / PAYLOAD_PER_MESSAGE) * tv;
    const perGbFixed = Number(perGbWei) / 1e18;
    if (perGbFixed < 0.01) return perGbFixed.toPrecision(3);
    return perGbFixed.toFixed(2);
  } catch {
    return "—";
  }
}

/** Returns true if credit is at or below zero (channels effectively empty). */
export function isCreditEmpty(creditBytes: bigint): boolean {
  return creditBytes === 0n;
}

const BYTES_PER_MB = 1_048_576n;

/**
 * Compute effective credit: channel credit when meaningful (≥ 1 MB), safe
 * balance as potential fallback when channels are empty or below display threshold.
 * Returns { bytes, isEstimate } — isEstimate=true means the value is based
 * on the safe (not yet in channels) and should be shown as approximate ("~").
 */
export function computeEffectiveCredit(
  channelsOut: string,
  safe: string,
  ticketValue: string,
): { bytes: bigint; isEstimate: boolean } {
  const channelBytes = computeCreditBytes(channelsOut, ticketValue);
  if (channelBytes >= BYTES_PER_MB) {
    return { bytes: channelBytes, isEstimate: false };
  }
  const safeBytes = computeCreditBytes(safe, ticketValue);
  return { bytes: safeBytes, isEstimate: safeBytes > 0n };
}
