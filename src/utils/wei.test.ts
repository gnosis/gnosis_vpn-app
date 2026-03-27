import { fromWeiToFixed } from "./wei.ts";

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void;
};

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertThrows(fn: () => unknown, messageIncludes: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof RangeError)) {
    throw new Error("Expected RangeError to be thrown");
  }
  if (!caught.message.includes(messageIncludes)) {
    throw new Error(
      `Expected error message to include "${messageIncludes}", got "${caught.message}"`,
    );
  }
}

Deno.test("fromWeiToFixed truncates extra precision without rounding up", () => {
  assertEquals(fromWeiToFixed(199n, 2, 2), "1.99");
  assertEquals(fromWeiToFixed(109n, 2, 1), "1.0");
  assertEquals(fromWeiToFixed(191n, 2, 2), "1.91");
});

Deno.test("fromWeiToFixed throws for negative wei bigint", () => {
  assertThrows(() => fromWeiToFixed(-1n, 18, 2), "wei must be non-negative");
});

Deno.test("fromWeiToFixed formats without fractional part when fractionDigits is zero", () => {
  assertEquals(fromWeiToFixed(199n, 2, 0), "1");
});

Deno.test("fromWeiToFixed supports zero decimals", () => {
  assertEquals(fromWeiToFixed(12345n, 0, 2), "12345.00");
});

Deno.test("fromWeiToFixed validates format parameters", () => {
  assertThrows(() => fromWeiToFixed(1n, -1, 2), "must be non-negative");
  assertThrows(() => fromWeiToFixed(1n, 18, -1), "must be non-negative");
  assertThrows(() => fromWeiToFixed(1n, 18.1, 2), "must be integers");
  assertThrows(
    () => fromWeiToFixed(1n, Number.NaN, 2),
    "must be finite numbers",
  );
  assertThrows(() => fromWeiToFixed(1n, 18, 101), "between 0 and 100");
  assertEquals(fromWeiToFixed(1n, 0, 100), `1.${"0".repeat(100)}`);
});

Deno.test("fromWeiToFixed keeps fallback precision for invalid numeric input", () => {
  assertEquals(fromWeiToFixed("not-a-number", 18, 4), "0.0000");
});

Deno.test("fromWeiToFixed handles number and string parsing branches", () => {
  assertEquals(fromWeiToFixed(199.99, 2, 2), "1.99");
  assertEquals(fromWeiToFixed("   ", 18, 2), "0.00");
  assertEquals(fromWeiToFixed("1e18", 18, 2), "1.00");
});
