import { describe, expect, it } from "vitest";

import { formatRate } from "./trafficFormat.ts";

describe("formatRate", () => {
  it("shows megabits with one decimal and a decimal comma", () => {
    expect(formatRate(0, "Mbit/s")).toBe("0,0");
    expect(formatRate(475_000, "Mbit/s")).toBe("3,8");
    expect(formatRate(12_500_000, "Mbit/s")).toBe("100,0");
  });

  it("shows megabytes with two decimals", () => {
    expect(formatRate(476_000, "MB/s")).toBe("0,48");
    expect(formatRate(2_400_000, "MB/s")).toBe("2,40");
  });

  it("treats unusable values as zero", () => {
    expect(formatRate(-5, "Mbit/s")).toBe("0,0");
    expect(formatRate(Number.NaN, "MB/s")).toBe("0,00");
  });
});
