/** Bits or bytes; the click on the readout switches between them. */
export type RateFamily = "bits" | "bytes";

export interface RateScale {
  unit: string;
  bytesPerUnit: number;
}

const SCALES: Record<RateFamily, [RateScale, RateScale]> = {
  bits: [
    { unit: "Mbit/s", bytesPerUnit: 1e6 / 8 },
    { unit: "Gbit/s", bytesPerUnit: 1e9 / 8 },
  ],
  bytes: [
    { unit: "MB/s", bytesPerUnit: 1e6 },
    { unit: "GB/s", bytesPerUnit: 1e9 },
  ],
};

const usable = (bytesPerSecond: number) =>
  Number.isFinite(bytesPerSecond) && bytesPerSecond > 0 ? bytesPerSecond : 0;

/** Mega until the figure would round to a thousand, giga after, so it never outgrows its cell. */
export function rateScale(
  bytesPerSecond: number,
  family: RateFamily,
): RateScale {
  const [mega, giga] = SCALES[family];
  return usable(bytesPerSecond) / mega.bytesPerUnit >= 999.5 ? giga : mega;
}

/** At most five characters with a decimal comma, as the live traffic readout shows them ("3,8"). */
export function formatRate(bytesPerSecond: number, scale: RateScale): string {
  const value = usable(bytesPerSecond) / scale.bytesPerUnit;
  const digits = scale.unit === "Mbit/s" || value >= 100 ? 1 : 2;
  return value.toFixed(digits).replace(".", ",");
}
