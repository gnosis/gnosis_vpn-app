const PAYLOAD_PER_MESSAGE = 650n; // bytes per HOPR message (spec constant)
const BYTES_PER_MB = 1_048_576n;
const BYTES_PER_GB = BYTES_PER_MB * 1024n; // 1,073,741,824 bytes
const BYTES_PER_TB = BYTES_PER_GB * 1024n;

const WEI_PER_HOPR = 10n ** 18n;

/**
 * Format a byte amount in `unitBytes` with half-up rounding (matches Number.toFixed
 * for positive values) without converting through `number`.
 */
function formatCreditUnit(
  creditBytes: bigint,
  unitBytes: bigint,
  decimals: number,
  suffix: string,
): string {
  if (decimals === 0) {
    const rounded = (creditBytes + unitBytes / 2n) / unitBytes;
    return `${rounded.toString()} ${suffix}`;
  }
  const scale = 10n ** BigInt(decimals);
  const scaled = (creditBytes * scale + unitBytes / 2n) / unitBytes;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(decimals, "0");
  return `${whole.toString()}.${fraction} ${suffix}`;
}

/** Half-up: format wei as whole-token decimal with a fixed number of fractional digits. */
function formatWeiHalfUp(valueWei: bigint, fractionDigits: number): string {
  const scale = 10n ** BigInt(fractionDigits);
  const rounded = (valueWei * scale + WEI_PER_HOPR / 2n) / WEI_PER_HOPR;
  const integerPart = rounded / scale;
  const fractionalPart = rounded % scale;
  if (fractionDigits === 0) return integerPart.toString();
  return `${integerPart.toString()}.${
    fractionalPart.toString().padStart(fractionDigits, "0")
  }`;
}

/**
 * For rates below 0.01 wxHOPR per GB, mirror `Number(x).toPrecision(3)` using only
 * bigint (caller guarantees wei is strictly between 0 and WEI_PER_HOPR / 100).
 */
function formatWeiPerGbBelowPointZeroOneToPrecision3(wei: bigint): string {
  const digits: number[] = [];
  let rem = wei;
  for (let i = 0; i < 25; i++) {
    rem *= 10n;
    const d = rem / WEI_PER_HOPR;
    // d is 0n–9n; keep digit extraction bigint-only (no Number()).
    digits.push(d.toString().charCodeAt(0) - 48);
    rem %= WEI_PER_HOPR;
  }
  let i = 0;
  while (i < digits.length && digits[i] === 0) i++;
  const sig1 = digits[i];
  if (sig1 === undefined) return "0.00";
  const sig2 = digits[i + 1] ?? 0;
  const sig3 = digits[i + 2] ?? 0;
  const sig4 = digits[i + 3] ?? 0;
  let block = sig1 * 100 + sig2 * 10 + sig3;
  if (sig4 >= 5) block += 1;
  if (block >= 1000) {
    // Align with `Number(x).toPrecision(3)` when rounding crosses a decimal decade (e.g. "0.0100").
    return formatWeiHalfUp(wei, 4);
  }
  const blockStr = block.toString().padStart(3, "0");
  return `0.${"0".repeat(i)}${blockStr}`;
}

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
 * Format credit bytes as a human-readable string.
 * Scales from MB up through GB and TB.
 */
export function formatCredit(creditBytes: bigint): string {
  if (creditBytes >= BYTES_PER_TB) {
    return formatCreditUnit(creditBytes, BYTES_PER_TB, 2, "TB");
  }
  if (creditBytes >= BYTES_PER_GB) {
    return formatCreditUnit(creditBytes, BYTES_PER_GB, 2, "GB");
  }
  return formatCreditUnit(creditBytes, BYTES_PER_MB, 0, "MB");
}

/**
 * Compute the wxHOPR-per-GB rate from ticket_value (wei string).
 * Formula: ((2^30) * ticket_value_wei) / 650, formatted as wxHOPR.
 * Returns a human-readable string like "110.00".
 */
export function computeHoprPerGb(ticketValue: string): string {
  try {
    const tv = BigInt(ticketValue.trim() || "0");
    if (tv === 0n) return "—";
    const perGbWei = (BYTES_PER_GB * tv) / PAYLOAD_PER_MESSAGE;
    const weiThreshold = WEI_PER_HOPR / 100n;
    if (perGbWei < weiThreshold) {
      return formatWeiPerGbBelowPointZeroOneToPrecision3(perGbWei);
    }
    return formatWeiHalfUp(perGbWei, 2);
  } catch {
    return "—";
  }
}

/** Returns true if credit is at or below zero (channels effectively empty). */
export function isCreditEmpty(creditBytes: bigint): boolean {
  return creditBytes === 0n;
}

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
  if (channelBytes > 0n && safeBytes === 0n) {
    return { bytes: channelBytes, isEstimate: false };
  }
  return { bytes: safeBytes, isEstimate: safeBytes > 0n };
}
