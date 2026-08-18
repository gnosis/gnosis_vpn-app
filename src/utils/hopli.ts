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

function stripTrailingZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Rounding direction for display amounts. Use "ceil" for "send at least"
 * copy so the headline number never understates the requirement; keep the
 * default "floor" for balances, which must never overstate what is owned. */
export type Rounding = "floor" | "ceil";

/** Round a raw 18-decimal amount up to a multiple of 10^(18 - fractionDigits). */
function ceilToFractionDigits(raw: bigint, fractionDigits: number): bigint {
  if (raw < 0n) {
    throw new RangeError("hopli must be non-negative");
  }
  if (fractionDigits >= 18) return raw;
  const unit = 10n ** BigInt(18 - fractionDigits);
  return ((raw + unit - 1n) / unit) * unit;
}

/** Placeholder shown when an amount can't be parsed (null/undefined/malformed). */
export const NO_VALUE = "-";

/**
 * Convert a hopli value to bigint without throwing. Returns null for null,
 * undefined, empty/whitespace, non-finite numbers, or any malformed input
 * (e.g. "1.5", "abc", "1e18") so callers can render {@link NO_VALUE} or fall
 * back instead of crashing. Whole numbers are truncated toward zero.
 */
export function toBigIntSafe(
  value: string | number | bigint | null | undefined,
): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : null;
  }
  const clean = value.trim();
  if (clean === "") return null;
  try {
    return BigInt(clean);
  } catch {
    return null;
  }
}

/** Format an xDAI amount (18-decimal base unit) as a decimal string without trailing zeros. */
export function formatXdai(
  value: string | number | bigint,
  fractionDigits = 2,
  rounding: Rounding = "floor",
): string {
  assertNonNegativeParams(18, fractionDigits);
  const hopli = toBigIntSafe(value);
  if (hopli !== null) {
    const raw = rounding === "ceil"
      ? ceilToFractionDigits(hopli, fractionDigits)
      : hopli;
    return stripTrailingZeros(fixedFloor(raw, 18, fractionDigits));
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  const scale = 10 ** fractionDigits;
  return stripTrailingZeros(
    (Math.floor((num / 1e18) * scale) / scale).toFixed(fractionDigits),
  );
}

/** Format a wxHOPR hopli amount (18-decimal base unit) as a decimal string
 * without trailing zeros — the same math as {@link formatXdai}. */
export function formatWxhopr(
  value: string | number | bigint,
  fractionDigits = 2,
  rounding: Rounding = "floor",
): string {
  return formatXdai(value, fractionDigits, rounding);
}

/** Format a wxHOPR hopli amount as a full decimal wxHOPR value without trailing zeros. */
export function wxhoprDecimal(
  hopli: string | bigint | null | undefined,
): string {
  const raw = toBigIntSafe(hopli);
  if (raw === null) return NO_VALUE;
  return stripTrailingZeros(fixedFloor(raw, 18, 18));
}

const SUBSCRIPT_DIGITS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

function toSubscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT_DIGITS[Number(d)])
    .join("");
}

/** Significant digits shown for a compact token amount (wxHOPR and xDAI alike). */
const COMPACT_SIG_FIGS = 3;

/** Ceiled ("send at least") amounts never show more than this many fraction
 * digits, as long as the value is big enough (>= 0.001) to survive the cut. */
const MAX_CEIL_FRACTION_DIGITS = 3;

/**
 * Format an 18-decimal base-unit amount as a compact decimal string.
 *
 * At/above `flooredThreshold` (a raw hopli value) the result is floored to 2
 * decimals. Below it, the value is shown with `COMPACT_SIG_FIGS` significant
 * figures; once that would need 4+ leading zeros (i.e. value < 0.0001) it
 * switches to subscript-zero notation: e.g. 0.00000349 → `0.0₅349`, where the
 * subscript counts the leading zeros after the decimal point.
 *
 * With `rounding: "ceil"` the value is rounded up at the same display
 * precision instead of truncated, additionally capped at
 * `MAX_CEIL_FRACTION_DIGITS` for values >= 0.001 (e.g. 0.0100…03 → `0.011`);
 * smaller dust amounts keep the sig-figs/subscript notation.
 */
function formatCompactAmount(
  raw: bigint,
  flooredThreshold: bigint,
  rounding: Rounding = "floor",
): string {
  if (raw <= 0n) return "0";

  const denom = 10n ** 18n;

  if (rounding === "ceil") {
    // Derive the display precision from the original value, round up to it,
    // then render the ceiled value with the plain floor logic below (exact at
    // this precision). Carry that crosses `flooredThreshold` — e.g.
    // 0.9999 → 1 — is handled by re-picking the branch for the ceiled value.
    const fracStr = (raw % denom).toString().padStart(18, "0");
    const leading = fracStr.search(/[1-9]/);
    const precision = raw >= flooredThreshold
      ? 2
      : leading <= 2
      ? Math.min(leading + COMPACT_SIG_FIGS, MAX_CEIL_FRACTION_DIGITS)
      : leading + COMPACT_SIG_FIGS;
    return formatCompactAmount(
      ceilToFractionDigits(raw, precision),
      flooredThreshold,
    );
  }

  const intPart = raw / denom;
  const fracStr = (raw % denom).toString().padStart(18, "0");

  if (raw >= flooredThreshold) {
    return stripTrailingZeros(`${intPart.toString()}.${fracStr.slice(0, 2)}`);
  }

  // Below the threshold: locate the first significant digit after the decimal.
  const leadingZeros = fracStr.search(/[1-9]/);
  const sig = stripTrailingZeros(
    `0.${fracStr.slice(leadingZeros, leadingZeros + COMPACT_SIG_FIGS)}`,
  ).slice(2);

  // 4+ leading zeros (value < 0.0001) — use compact subscript-zero notation.
  if (leadingZeros >= 4) {
    return `0.0${toSubscript(leadingZeros)}${sig}`;
  }
  return `0.${"0".repeat(leadingZeros)}${sig}`;
}

/**
 * Format a wxHOPR hopli amount (18-decimal base unit) as a compact wxHOPR value.
 *
 * The unit is always "wxHOPR" — we never switch to Milli/Micro/etc. Values >= 1
 * are floored to 2 decimals; smaller values use significant figures, dropping to
 * subscript-zero notation below 0.0001.
 */
export function humanWxhoprParts(
  hopli: string | bigint | null | undefined,
  rounding: Rounding = "floor",
): { amount: string; unit: string } {
  const raw = toBigIntSafe(hopli);
  const amount = raw === null
    ? NO_VALUE
    : formatCompactAmount(raw, 10n ** 18n, rounding);
  return { amount, unit: "wxHOPR" };
}

export function humanWxhopr(
  hopli: string | bigint | null | undefined,
  rounding: Rounding = "floor",
): string {
  const { amount, unit } = humanWxhoprParts(hopli, rounding);
  return amount === NO_VALUE ? amount : `${amount} ${unit}`;
}

/**
 * Format an xDAI amount (18-decimal base unit) as a compact value, mirroring
 * the wxHOPR display: floored to 2 decimals above 0.1, significant figures
 * below it, and subscript-zero notation below 0.0001. Returns the number only —
 * callers render the "xDAI" unit separately.
 */
export function humanXdai(value: string | bigint | null | undefined): string {
  const raw = toBigIntSafe(value);
  return raw === null ? NO_VALUE : formatCompactAmount(raw, 10n ** 17n);
}
