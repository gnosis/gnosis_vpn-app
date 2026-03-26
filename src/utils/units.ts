function assertNonNegativeWeiFormatParams(
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

/** Format a non-negative wei value as a decimal string, truncating to `fractionDigits` (never rounds up). */
function formatWeiFixedFloor(
  wei: bigint,
  decimals: number,
  fractionDigits: number,
): string {
  assertNonNegativeWeiFormatParams(decimals, fractionDigits);
  if (wei < 0n) {
    throw new RangeError("wei must be non-negative");
  }
  const fractionScale = 10n ** BigInt(fractionDigits);
  const denom = 10n ** BigInt(decimals);
  const scaled = (wei * fractionScale) / denom;
  const intPart = scaled / fractionScale;
  const fracPart = scaled % fractionScale;
  const fracStr = fracPart.toString().padStart(fractionDigits, "0");
  return fractionDigits > 0
    ? `${intPart.toString()}.${fracStr}`
    : intPart.toString();
}

export function fromWeiToFixed(
  value: string | number | bigint,
  decimals = 18,
  fractionDigits = 2,
): string {
  assertNonNegativeWeiFormatParams(decimals, fractionDigits);
  let wei: bigint | undefined;
  if (typeof value === "bigint") {
    wei = value;
  } else if (typeof value === "number") {
    if (Number.isFinite(value)) {
      wei = BigInt(Math.trunc(value));
    }
  } else {
    const clean = value.trim();
    try {
      wei = BigInt(clean.length > 0 ? clean : "0");
    } catch {
      // Fall through to Number-based parsing for non-integer input.
    }
  }

  if (wei !== undefined) {
    return formatWeiFixedFloor(wei, decimals, fractionDigits);
  }

  const num = Number(value);
  if (!Number.isFinite(num)) return (0).toFixed(fractionDigits);
  const fractionScale = 10 ** fractionDigits;
  const floored = Math.floor((num / 10 ** decimals) * fractionScale) /
    fractionScale;
  return floored.toFixed(fractionDigits);
}
