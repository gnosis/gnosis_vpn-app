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

    const base = 10n ** BigInt(decimals);
    let intPart = wei / base;
    const fracPart = wei % base;

    if (fracPart === 0n) {
      return `${intPart.toString()}.${"0".repeat(fractionDigits)}`;
    }

    const fullFrac = fracPart.toString().padStart(decimals, "0");

    const firstNonZeroIdx = fullFrac.search(/[1-9]/);
    let showLen = Math.max(
      fractionDigits,
      firstNonZeroIdx >= 0 ? firstNonZeroIdx + 1 : fractionDigits,
    );
    if (showLen > decimals) showLen = decimals;

    const scale = 10n ** BigInt(showLen);
    let rounded = (fracPart * scale + base / 2n) / base;
    if (rounded === scale) {
      intPart = intPart + 1n;
      return `${intPart.toString()}.${"0".repeat(showLen)}`;
    }
    let fracOut = rounded.toString().padStart(showLen, "0");

    if (showLen > fractionDigits) {
      const trimmed = fracOut.replace(/0+$/, "");
      fracOut = trimmed.length >= fractionDigits
        ? trimmed
        : fracOut.slice(0, fractionDigits);
    }

    return `${intPart.toString()}.${fracOut}`;
  } catch {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0.00";
    return (num / 1e18).toFixed(fractionDigits);
  }
}
