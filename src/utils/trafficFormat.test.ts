import { describe, expect, it } from "vitest";

import { formatRate } from "./trafficFormat.ts";

describe("formatRate", () => {
  it("uses decimal units and drops trailing zeros", () => {
    expect(formatRate(0)).toBe("0 B/s");
    expect(formatRate(999)).toBe("999 B/s");
    expect(formatRate(1000)).toBe("1 kB/s");
    expect(formatRate(37_000)).toBe("37 kB/s");
    expect(formatRate(1_500_000)).toBe("1.5 MB/s");
    expect(formatRate(2_400_000_000)).toBe("2.4 GB/s");
  });

  it("treats unusable values as zero", () => {
    expect(formatRate(-5)).toBe("0 B/s");
    expect(formatRate(Number.NaN)).toBe("0 B/s");
  });
});
