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

/**
 * Format credit bytes as a human-readable string: "1.98 GB", "568 MB", "0 MB".
 */
export function formatCredit(creditBytes: bigint): string {
  if (creditBytes >= BYTES_PER_GB) {
    const gb = (Number(creditBytes) / Number(BYTES_PER_GB)).toFixed(2);
    return `${gb} GB`;
  }
  const mb = (Number(creditBytes) / 1_048_576).toFixed(0);
  return `${mb} MB`;
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
    if (perGbFixed < 0.01) return perGbFixed.toExponential(2);
    return perGbFixed.toFixed(2);
  } catch {
    return "—";
  }
}

/** Returns true if credit is at or below zero (channels effectively empty). */
export function isCreditEmpty(creditBytes: bigint): boolean {
  return creditBytes === 0n;
}
