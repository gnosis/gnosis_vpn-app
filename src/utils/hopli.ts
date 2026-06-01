function assertNonNegativeParams(
  decimals: number,
  fractionDigits: number,
): void {
  if (!Number.isFinite(decimals) || !Number.isFinite(fractionDigits)) {
    throw new RangeError("fractionDigits and decimals must be finite numbers");
  }
  if (!Number.isInteger(decimals) || !Number.isInteger(fractionDigits)) {
    throw new RangeError("fractionDigits and decimals must be integers");
  }
  if (fractionDigits < 0 || decimals < 0) {
    throw new RangeError("fractionDigits and decimals must be non-negative");
  }
  if (fractionDigits > 100) {
    throw new RangeError("fractionDigits must be between 0 and 100");
  }
}

function fixedFloor(
  hopli: bigint,
  decimals: number,
  fractionDigits: number,
): string {
  assertNonNegativeParams(decimals, fractionDigits);
  if (hopli < 0n) {
    throw new RangeError("hopli must be non-negative");
  }
  const fractionScale = 10n ** BigInt(fractionDigits);
  const denom = 10n ** BigInt(decimals);
  const scaled = (hopli * fractionScale) / denom;
  const intPart = scaled / fractionScale;
  const fracPart = scaled % fractionScale;
  const fracStr = fracPart.toString().padStart(fractionDigits, "0");
  return fractionDigits > 0
    ? `${intPart.toString()}.${fracStr}`
    : intPart.toString();
}

function toHopli(value: string | number | bigint): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : undefined;
  }
  const clean = value.trim();
  try {
    return BigInt(clean.length > 0 ? clean : "0");
  } catch {
    return undefined;
  }
}

function stripTrailingZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Minimum wei value that formatXdai renders as non-zero (0.01 xDAI, matches default fractionDigits=2). */
export const MIN_DISPLAYABLE_XDAI_WEI = 10n ** 16n;

/** Format an xDAI amount (18-decimal base unit) as a decimal string without trailing zeros. */
export function formatXdai(
  value: string | number | bigint,
  fractionDigits = 2,
): string {
  assertNonNegativeParams(18, fractionDigits);
  const hopli = toHopli(value);
  if (hopli !== undefined) {
    return stripTrailingZeros(fixedFloor(hopli, 18, fractionDigits));
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  const scale = 10 ** fractionDigits;
  return stripTrailingZeros(
    (Math.floor((num / 1e18) * scale) / scale).toFixed(fractionDigits),
  );
}

/** Format a wxHOPR hopli amount as a full decimal wxHOPR value without trailing zeros. */
export function wxhoprDecimal(hopli: string | bigint): string {
  const raw = typeof hopli === "bigint"
    ? hopli
    : BigInt(String(hopli).trim() || "0");
  return stripTrailingZeros(fixedFloor(raw, 18, 18));
}

const SUBSCRIPT_DIGITS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

function toSubscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT_DIGITS[Number(d)])
    .join("");
}

/** Number of significant digits shown for the wxHOPR amount. */
const WXHOPR_SIG_FIGS = 3;

/**
 * Format a wxHOPR hopli amount (18-decimal base unit) as a compact wxHOPR value.
 *
 * The unit is always "wxHOPR" — we never switch to Milli/Micro/etc. Values below
 * 0.0001 (which would otherwise render with 4+ leading zeros) use subscript-zero
 * notation: e.g. 0.00000349 → `0.0₅349`, where the subscript counts the leading
 * zeros after the decimal point.
 */
export function humanWxhoprParts(
  hopli: string | bigint,
): { amount: string; unit: string } {
  const raw = typeof hopli === "bigint"
    ? hopli
    : BigInt(String(hopli).trim() || "0");

  return { amount: formatWxhoprAmount(raw), unit: "wxHOPR" };
}

function formatWxhoprAmount(raw: bigint): string {
  if (raw <= 0n) return "0";

  const denom = 10n ** 18n;
  const intPart = raw / denom;
  const fracStr = (raw % denom).toString().padStart(18, "0");

  if (intPart > 0n) {
    // Value >= 1: show up to 2 decimals, trailing zeros stripped.
    return stripTrailingZeros(`${intPart.toString()}.${fracStr.slice(0, 2)}`);
  }

  // Value < 1: locate the first significant digit after the decimal point.
  const firstNonZero = fracStr.search(/[1-9]/);
  const leadingZeros = firstNonZero;
  const sig = stripTrailingZeros(
    `0.${fracStr.slice(firstNonZero, firstNonZero + WXHOPR_SIG_FIGS)}`,
  ).slice(2);

  // < 0.0001 means 4+ leading zeros — use compact subscript-zero notation.
  if (leadingZeros >= 4) {
    return `0.0${toSubscript(leadingZeros)}${sig}`;
  }
  return `0.${"0".repeat(leadingZeros)}${sig}`;
}

export function humanWxhopr(hopli: string | bigint): string {
  const { amount, unit } = humanWxhoprParts(hopli);
  return `${amount} ${unit}`;
}
