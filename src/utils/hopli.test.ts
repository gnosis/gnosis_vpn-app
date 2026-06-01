import { describe, expect, it } from "vitest";
import {
  formatXdai,
  humanWxhopr,
  humanWxhoprParts,
  humanXdai,
  NO_VALUE,
  toBigIntSafe,
  wxhoprDecimal,
} from "./hopli.ts";

describe("formatXdai", () => {
  it("truncates extra precision without rounding up", () => {
    expect(formatXdai(199n * 10n ** 16n, 2)).toBe("1.99");
    expect(formatXdai(109n * 10n ** 16n, 1)).toBe("1");
    expect(formatXdai(191n * 10n ** 16n, 2)).toBe("1.91");
  });

  it("throws for negative hopli bigint", () => {
    expect(() => formatXdai(-1n, 2)).toThrow(/hopli must be non-negative/);
  });

  it("strips trailing zeros", () => {
    expect(formatXdai(1n * 10n ** 16n, 4)).toBe("0.01");
    expect(formatXdai(1n * 10n ** 18n, 2)).toBe("1");
    expect(formatXdai(15n * 10n ** 17n, 2)).toBe("1.5");
  });

  it("formats without fractional part when fractionDigits is zero", () => {
    expect(formatXdai(199n * 10n ** 16n, 0)).toBe("1");
  });

  it("validates format parameters", () => {
    expect(() => formatXdai(1n, -1)).toThrow(/must be non-negative/);
    expect(() => formatXdai(1n, 101)).toThrow(/between 0 and 100/);
  });

  it("keeps fallback for invalid numeric input", () => {
    expect(formatXdai("not-a-number", 4)).toBe("0");
  });

  it("handles number and string parsing branches", () => {
    expect(formatXdai("   ", 2)).toBe("0");
    expect(formatXdai("1e18", 2)).toBe("1");
  });
});

describe("wxhoprDecimal", () => {
  it("shows full wxHOPR value without trailing zeros", () => {
    expect(wxhoprDecimal(1n * 10n ** 18n)).toBe("1");
    expect(wxhoprDecimal(15n * 10n ** 17n)).toBe("1.5");
    expect(wxhoprDecimal(1n * 10n ** 15n)).toBe("0.001");
  });

  it("handles sub-micro amounts", () => {
    expect(wxhoprDecimal(800_000_000n)).toBe("0.0000000008");
  });

  it("accepts string input", () => {
    expect(wxhoprDecimal("1000000000000000000")).toBe("1");
  });
});

describe("humanWxhopr", () => {
  it("always uses wxHOPR as the unit", () => {
    expect(humanWxhopr(1n * 10n ** 18n)).toBe("1 wxHOPR");
    expect(humanWxhopr(5n * 10n ** 18n)).toBe("5 wxHOPR");
  });

  it("shows up to 2 decimals for values >= 1", () => {
    expect(humanWxhopr(15n * 10n ** 17n)).toBe("1.5 wxHOPR");
    expect(humanWxhopr(123456n * 10n ** 13n)).toBe("1.23 wxHOPR");
  });

  it("renders the milli range as a plain wxHOPR decimal", () => {
    expect(humanWxhopr(1n * 10n ** 15n)).toBe("0.001 wxHOPR");
    // 34.9 MilliwxHOPR — the reported case — stays a plain decimal (>= 0.0001).
    expect(humanWxhopr(349n * 10n ** 14n)).toBe("0.0349 wxHOPR");
  });

  it("uses subscript-zero notation below 0.0001", () => {
    expect(humanWxhopr(1n * 10n ** 12n)).toBe("0.0₅1 wxHOPR");
    expect(humanWxhopr(1n * 10n ** 9n)).toBe("0.0₈1 wxHOPR");
    expect(humanWxhopr(42n)).toBe("0.0₁₆42 wxHOPR");
  });

  it("keeps 0.0001 as a plain decimal (the threshold)", () => {
    expect(humanWxhopr(1n * 10n ** 14n)).toBe("0.0001 wxHOPR");
  });

  it("truncates to 3 significant figures", () => {
    expect(humanWxhopr(123456n * 10n ** 8n)).toBe("0.0₄123 wxHOPR");
  });

  it("renders zero", () => {
    expect(humanWxhopr(0n)).toBe("0 wxHOPR");
  });

  it("accepts string input", () => {
    expect(humanWxhopr("1000000000000000000")).toBe("1 wxHOPR");
  });

  it("handles large balances without Number precision loss", () => {
    // 10^18 - 1 hopli is just below 1 wxHOPR; bigint math keeps full precision.
    expect(humanWxhopr(10n ** 18n - 1n)).toBe("0.999 wxHOPR");
  });
});

describe("humanXdai", () => {
  it("floors to 2 decimals above 0.1", () => {
    expect(humanXdai(5n * 10n ** 18n)).toBe("5");
    expect(humanXdai(199n * 10n ** 16n)).toBe("1.99");
    expect(humanXdai(5n * 10n ** 17n)).toBe("0.5");
    // 0.123456 floors (does not round) to 0.12.
    expect(humanXdai(123456n * 10n ** 12n)).toBe("0.12");
  });

  it("treats 0.1 as the floor boundary", () => {
    expect(humanXdai(1n * 10n ** 17n)).toBe("0.1");
  });

  it("uses significant figures between 0.0001 and 0.1", () => {
    expect(humanXdai(5n * 10n ** 16n)).toBe("0.05");
    expect(humanXdai(34n * 10n ** 15n)).toBe("0.034");
    expect(humanXdai(1n * 10n ** 14n)).toBe("0.0001");
  });

  it("uses subscript-zero notation below 0.0001", () => {
    expect(humanXdai(1n * 10n ** 13n)).toBe("0.0₄1");
    expect(humanXdai(349n * 10n ** 11n)).toBe("0.0₄349");
  });

  it("renders zero and accepts string input", () => {
    expect(humanXdai(0n)).toBe("0");
    expect(humanXdai("500000000000000000")).toBe("0.5");
  });
});

describe("toBigIntSafe", () => {
  it("passes through valid bigint and integer-string input", () => {
    expect(toBigIntSafe(42n)).toBe(42n);
    expect(toBigIntSafe("1000000000000000000")).toBe(10n ** 18n);
    expect(toBigIntSafe("  123  ")).toBe(123n);
    expect(toBigIntSafe("0")).toBe(0n);
  });

  it("returns null for null and undefined instead of throwing", () => {
    expect(toBigIntSafe(null)).toBeNull();
    expect(toBigIntSafe(undefined)).toBeNull();
  });

  it("returns null for empty and malformed strings", () => {
    expect(toBigIntSafe("")).toBeNull();
    expect(toBigIntSafe("   ")).toBeNull();
    expect(toBigIntSafe("abc")).toBeNull();
    expect(toBigIntSafe("1.5")).toBeNull();
    expect(toBigIntSafe("0xdeadbeef")).toBe(0xdeadbeefn); // valid hex literal
  });
});

describe("placeholder fallback for invalid input", () => {
  it("renders NO_VALUE instead of crashing on null/undefined", () => {
    expect(humanWxhopr(null)).toBe(NO_VALUE);
    expect(humanWxhopr(undefined)).toBe(NO_VALUE);
    expect(humanWxhoprParts(null)).toEqual({
      amount: NO_VALUE,
      unit: "wxHOPR",
    });
    expect(humanXdai(null)).toBe(NO_VALUE);
    expect(wxhoprDecimal(undefined)).toBe(NO_VALUE);
  });

  it("renders NO_VALUE on malformed strings", () => {
    expect(humanWxhopr("not-a-number")).toBe(NO_VALUE);
    expect(humanXdai("1.5")).toBe(NO_VALUE);
  });

  it("still renders a real zero balance as 0, not the placeholder", () => {
    expect(humanWxhopr("0")).toBe("0 wxHOPR");
    expect(humanXdai("0")).toBe("0");
  });
});
