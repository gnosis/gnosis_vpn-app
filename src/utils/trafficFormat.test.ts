import { describe, expect, it } from "vitest";

import { formatRate, rateScale } from "./trafficFormat.ts";

const show = (bytesPerSecond: number, family: "bits" | "bytes") => {
  const scale = rateScale(bytesPerSecond, family);
  return `${formatRate(bytesPerSecond, scale)} ${scale.unit}`;
};

describe("rate readout", () => {
  it("shows megabits with one decimal and a decimal comma", () => {
    expect(show(0, "bits")).toBe("0,0 Mbit/s");
    expect(show(475_000, "bits")).toBe("3,8 Mbit/s");
    expect(show(124_900_000, "bits")).toBe("999,2 Mbit/s");
  });

  it("switches to gigabits before the figure reaches a thousand", () => {
    expect(show(124_950_000, "bits")).toBe("1,00 Gbit/s");
    expect(show(157_000_000, "bits")).toBe("1,26 Gbit/s");
    expect(show(1_250_000_000, "bits")).toBe("10,00 Gbit/s");
  });

  it("shows megabytes with two decimals until a hundred", () => {
    expect(show(476_000, "bytes")).toBe("0,48 MB/s");
    expect(show(125_000_000, "bytes")).toBe("125,0 MB/s");
    expect(show(1_500_000_000, "bytes")).toBe("1,50 GB/s");
  });

  it("never needs more than five characters for the figure", () => {
    for (let rate = 1; rate < 1e11; rate *= 1.37) {
      for (const family of ["bits", "bytes"] as const) {
        expect(formatRate(rate, rateScale(rate, family)).length)
          .toBeLessThanOrEqual(5);
      }
    }
  });

  it("formats a figure in the scale it is given, so value and peak match", () => {
    const peak = rateScale(157_000_000, "bits");
    expect(formatRate(12_500_000, peak)).toBe("0,10");
  });

  it("treats unusable values as zero", () => {
    expect(show(-5, "bits")).toBe("0,0 Mbit/s");
    expect(show(Number.NaN, "bytes")).toBe("0,00 MB/s");
  });
});
