import { describe, expect, it } from "vitest";
import { shortAddress, shortPeerId } from "./shortAddress.ts";

describe("shortAddress", () => {
  it("keeps both ends of a long address", () => {
    expect(shortAddress("0x1234567890abcdef")).toBe("0x1234…cdef");
  });
  it("leaves a short one alone", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});

describe("shortPeerId", () => {
  it("keeps the prefix and the last two characters", () => {
    expect(shortPeerId("12D3KooWRk7fqAvZn8zE4d9bLq1x9")).toBe("12D3…x9");
  });
  it("leaves a short one alone", () => {
    expect(shortPeerId("12D3x9")).toBe("12D3x9");
  });
});
