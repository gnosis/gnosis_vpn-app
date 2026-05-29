import { describe, expect, it } from "vitest";
import { formatXdai, humanWxhopr } from "./hopli.ts";

describe("formatXdai", () => {
  it("truncates extra precision without rounding up", () => {
    expect(formatXdai(199n * 10n ** 16n, 2)).toBe("1.99");
    expect(formatXdai(109n * 10n ** 16n, 1)).toBe("1.0");
    expect(formatXdai(191n * 10n ** 16n, 2)).toBe("1.91");
  });

  it("throws for negative hopli bigint", () => {
    expect(() => formatXdai(-1n, 2)).toThrow(/hopli must be non-negative/);
  });

  it("formats without fractional part when fractionDigits is zero", () => {
    expect(formatXdai(199n * 10n ** 16n, 0)).toBe("1");
  });

  it("validates format parameters", () => {
    expect(() => formatXdai(1n, -1)).toThrow(/must be non-negative/);
    expect(() => formatXdai(1n, 101)).toThrow(/between 0 and 100/);
  });

  it("keeps fallback precision for invalid numeric input", () => {
    expect(formatXdai("not-a-number", 4)).toBe("0.0000");
  });

  it("handles number and string parsing branches", () => {
    expect(formatXdai("   ", 2)).toBe("0.00");
    expect(formatXdai("1e18", 2)).toBe("1.00");
    expect(formatXdai(1n * 10n ** 18n, 2)).toBe("1.00");
  });
});

describe("humanWxhopr", () => {
  it("formats whole wxHOPR amounts", () => {
    expect(humanWxhopr(1n * 10n ** 18n)).toBe("1.0 wxHOPR");
    expect(humanWxhopr(5n * 10n ** 18n)).toBe("5.0 wxHOPR");
  });

  it("formats milli range", () => {
    expect(humanWxhopr(1n * 10n ** 15n)).toBe("1.0 MilliwxHOPR");
  });

  it("formats micro range", () => {
    expect(humanWxhopr(1n * 10n ** 12n)).toBe("1.0 MicrowxHOPR");
  });

  it("formats sub-micro as GwxHopli", () => {
    expect(humanWxhopr(1n * 10n ** 9n)).toBe("1.0 GwxHopli");
  });

  it("formats raw hopli for tiny amounts", () => {
    expect(humanWxhopr(42n)).toBe("42 wxHopli");
  });

  it("accepts string input", () => {
    expect(humanWxhopr("1000000000000000000")).toBe("1.0 wxHOPR");
  });
});
