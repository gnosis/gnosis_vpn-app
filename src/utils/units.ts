/** Format wei as a decimal string, truncating (flooring) to `fractionDigits` — never rounds up. */
function formatWeiFixedFloor(
  wei: bigint,
  decimals: number,
  fractionDigits: number,
): string {
  const fractionScale = 10n ** BigInt(fractionDigits);
  const denom = 10n ** BigInt(decimals);
  const scaled = (wei * fractionScale) / denom;
  const intPart = scaled / fractionScale;
  const fracPart = scaled % fractionScale;
  const fracStr = fracPart.toString().padStart(fractionDigits, "0");
  return `${intPart.toString()}.${fracStr}`;
}

export function fromWeiToFixed(
  value: string | number | bigint,
  decimals = 18,
  fractionDigits = 2,
): string {
  try {
    let wei: bigint;
    if (typeof value === "bigint") {
      wei = value;
    } else if (typeof value === "number") {
      wei = BigInt(Math.trunc(value));
    } else {
      const clean = value.trim();
      wei = BigInt(clean.length > 0 ? clean : "0");
    }
    return formatWeiFixedFloor(wei, decimals, fractionDigits);
  } catch {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0.00";
    const fractionScale = 10 ** fractionDigits;
    const floored = Math.floor((num / 10 ** decimals) * fractionScale) /
      fractionScale;
    return floored.toFixed(fractionDigits);
  }
}
