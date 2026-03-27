import { describe, expect, it } from "vitest";
import { fromWeiToFixed } from "./wei.ts";

describe("fromWeiToFixed", () => {
  it("truncates extra precision without rounding up", () => {
    expect(fromWeiToFixed(199n, 2, 2)).toBe("1.99");
    expect(fromWeiToFixed(109n, 2, 1)).toBe("1.0");
    expect(fromWeiToFixed(191n, 2, 2)).toBe("1.91");
  });

  it("throws for negative wei bigint", () => {
    expect(() => fromWeiToFixed(-1n, 18, 2)).toThrow(
      /wei must be non-negative/,
    );
  });

  it("formats without fractional part when fractionDigits is zero", () => {
    expect(fromWeiToFixed(199n, 2, 0)).toBe("1");
  });

  it("supports zero decimals", () => {
    expect(fromWeiToFixed(12345n, 0, 2)).toBe("12345.00");
  });

  it("validates format parameters", () => {
    expect(() => fromWeiToFixed(1n, -1, 2)).toThrow(/must be non-negative/);
    expect(() => fromWeiToFixed(1n, 18, -1)).toThrow(/must be non-negative/);
    expect(() => fromWeiToFixed(1n, 18.1, 2)).toThrow(/must be integers/);
    expect(() => fromWeiToFixed(1n, Number.NaN, 2)).toThrow(
      /must be finite numbers/,
    );
    expect(() => fromWeiToFixed(1n, 18, 101)).toThrow(/between 0 and 100/);
    expect(fromWeiToFixed(1n, 0, 100)).toBe(`1.${"0".repeat(100)}`);
  });

  it("keeps fallback precision for invalid numeric input", () => {
    expect(fromWeiToFixed("not-a-number", 18, 4)).toBe("0.0000");
  });

  it("handles number and string parsing branches", () => {
    expect(fromWeiToFixed(199.99, 2, 2)).toBe("1.99");
    expect(fromWeiToFixed("   ", 18, 2)).toBe("0.00");
    expect(fromWeiToFixed("1e18", 18, 2)).toBe("1.00");
  });
});
