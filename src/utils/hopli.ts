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
  const raw =
    typeof hopli === "bigint" ? hopli : BigInt(String(hopli).trim() || "0");
  return stripTrailingZeros(fixedFloor(raw, 18, 18));
}

// Mirrors gnosis_vpn-client/gnosis_vpn-lib/src/balance.rs `human_wxhopr` — keep unit thresholds in sync.
export function humanWxhoprParts(
  hopli: string | bigint,
): { amount: string; unit: string } {
  const raw =
    typeof hopli === "bigint" ? hopli : BigInt(String(hopli).trim() || "0");
  const v = Number(raw) / 1e18;

  if (v >= 1) return { amount: v.toFixed(1), unit: "wxHOPR" };
  if (v >= 1e-3) return { amount: (v * 1e3).toFixed(1), unit: "MilliwxHOPR" };
  if (v >= 1e-6) return { amount: (v * 1e6).toFixed(1), unit: "MicrowxHOPR" };
  if (v >= 1e-9) return { amount: (v * 1e9).toFixed(1), unit: "GwxHopli" };
  if (v >= 1e-12) return { amount: (v * 1e12).toFixed(1), unit: "MwxHopli" };
  if (v >= 1e-15) return { amount: (v * 1e15).toFixed(1), unit: "KwxHopli" };
  return { amount: String(Math.round(v * 1e18)), unit: "wxHopli" };
}

export function humanWxhopr(hopli: string | bigint): string {
  const { amount, unit } = humanWxhoprParts(hopli);
  return `${amount} ${unit}`;
}
