const PAYLOAD_BYTES_PER_MESSAGE = 650n; // bytes per HOPR message (spec constant)
const BYTES_PER_MB = 1_048_576n;
const BYTES_PER_GB = BYTES_PER_MB * 1024n; // 1,073,741,824 bytes
const BYTES_PER_TB = BYTES_PER_GB * 1024n;

/** 10^18 wei per whole token (standard ERC-20 decimals). */
const WEI_PER_TOKEN = 10n ** 18n;

/** Insert comma thousands separators into a non-negative integer string. */
function withThousandsSep(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

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
    return `${withThousandsSep(rounded.toString())} ${suffix}`;
  }
  const scale = 10n ** BigInt(decimals);
  const scaled = (creditBytes * scale + unitBytes / 2n) / unitBytes;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(decimals, "0");
  return `${withThousandsSep(whole.toString())}.${fraction} ${suffix}`;
}

/** Half-up: format wei as whole-token decimal with a fixed number of fractional digits. */
function formatWeiHalfUp(valueWei: bigint, fractionDigits: number): string {
  const scale = 10n ** BigInt(fractionDigits);
  const rounded = (valueWei * scale + WEI_PER_TOKEN / 2n) / WEI_PER_TOKEN;
  const integerPart = rounded / scale;
  const fractionalPart = rounded % scale;
  if (fractionDigits === 0) return integerPart.toString();
  return `${integerPart.toString()}.${
    fractionalPart.toString().padStart(fractionDigits, "0")
  }`;
}

/**
 * For rates below 0.01 wxHOPR per GB, mirror `Number(x).toPrecision(3)` using only
 * bigint (caller guarantees `valueWei` is strictly between 0 and WEI_PER_TOKEN / 100).
 */
function formatWeiPerGbBelowPointZeroOneToPrecision3(valueWei: bigint): string {
  const digits: number[] = [];
  let remainderWei = valueWei;
  for (let step = 0; step < 25; step++) {
    remainderWei *= 10n;
    const quotientDigit = remainderWei / WEI_PER_TOKEN;
    // quotientDigit is 0n–9n; keep digit extraction bigint-only (no Number()).
    digits.push(quotientDigit.toString().charCodeAt(0) - 48);
    remainderWei %= WEI_PER_TOKEN;
  }
  let leadingFractionalZeros = 0;
  while (
    leadingFractionalZeros < digits.length &&
    digits[leadingFractionalZeros] === 0
  ) {
    leadingFractionalZeros++;
  }
  const significantDigit1 = digits[leadingFractionalZeros];
  if (significantDigit1 === undefined) return "0.00";
  const significantDigit2 = digits[leadingFractionalZeros + 1] ?? 0;
  const significantDigit3 = digits[leadingFractionalZeros + 2] ?? 0;
  const significantDigit4 = digits[leadingFractionalZeros + 3] ?? 0;
  let block = significantDigit1 * 100 + significantDigit2 * 10 +
    significantDigit3;
  if (significantDigit4 >= 5) block += 1;
  if (block >= 1000) {
    // Align with `Number(x).toPrecision(3)` when rounding crosses a decimal decade (e.g. "0.0100").
    return formatWeiHalfUp(valueWei, 4);
  }
  const blockStr = block.toString().padStart(3, "0");
  return `0.${"0".repeat(leadingFractionalZeros)}${blockStr}`;
}

/**
 * Compute remaining credit in bytes from channel balance and ticket price.
 * Both inputs are wei amounts as decimal strings (18 decimals).
 * Returns 0n if ticketPrice is zero or inputs are invalid.
 */
export function computeCreditBytes(
  channelsOut: string,
  ticketPrice: string,
  hops = 1,
): bigint {
  try {
    const channelsOutWei = BigInt(channelsOut.trim() || "0");
    const ticketPriceWei = BigInt(ticketPrice.trim() || "0");
    if (ticketPriceWei === 0n || channelsOutWei === 0n) return 0n;
    const h = BigInt(Math.max(1, Math.floor(hops)));
    const maxMessages = channelsOutWei / (ticketPriceWei * h);
    return maxMessages * PAYLOAD_BYTES_PER_MESSAGE;
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
 * Compute the wxHOPR-per-GB rate from ticketPrice (wei string).
 * Exact rate is rational wei; we round to nearest integer wei (half-up) before formatting.
 * Returns a human-readable string like "110.00".
 */
export function computeHoprPerGb(ticketPrice: string, hops = 1): string {
  try {
    const ticketPriceWei = BigInt(ticketPrice.trim() || "0");
    if (ticketPriceWei === 0n) return "—";
    const h = BigInt(Math.max(1, hops));
    const perGbWei =
      (BYTES_PER_GB * ticketPriceWei * h + PAYLOAD_BYTES_PER_MESSAGE / 2n) /
      PAYLOAD_BYTES_PER_MESSAGE;
    const weiThreshold = WEI_PER_TOKEN / 100n;
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
  ticketPrice: string,
  hops = 1,
): { bytes: bigint; isEstimate: boolean } {
  const channelBytes = computeCreditBytes(channelsOut, ticketPrice, hops);
  if (channelBytes >= BYTES_PER_MB) {
    return { bytes: channelBytes, isEstimate: false };
  }
  const safeBytes = computeCreditBytes(safe, ticketPrice, hops);
  if (channelBytes > 0n && safeBytes === 0n) {
    return { bytes: channelBytes, isEstimate: false };
  }
  return { bytes: safeBytes, isEstimate: safeBytes > 0n };
}
