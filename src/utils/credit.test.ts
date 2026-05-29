import { describe, expect, it } from "vitest";
import { computeEffectiveCredit, formatCredit } from "./credit.ts";
import type { CapacityEntry } from "@src/services/vpnService.ts";

const BYTES_PER_MB = 1_048_576n;
const BYTES_PER_TB = BYTES_PER_MB * 1024n * 1024n;

function makeEntry(
  byte_capacity: number,
  allocator: "Safe" | { Peer: string } = "Safe",
): CapacityEntry {
  return {
    allocator,
    capacity: { stake: "0", expected_messages: 0, byte_capacity },
  };
}

describe("computeEffectiveCredit", () => {
  it("returns 0 for empty allocations", () => {
    expect(computeEffectiveCredit([])).toBe(0n);
  });

  it("sums bytes from a single safe allocation", () => {
    expect(computeEffectiveCredit([makeEntry(1_000_000)])).toBe(1_000_000n);
  });

  it("sums bytes from a single peer allocation", () => {
    expect(computeEffectiveCredit([makeEntry(500_000, { Peer: "0xabc" })])).toBe(
      500_000n,
    );
  });

  it("sums bytes across mixed safe and peer allocations", () => {
    const entries = [
      makeEntry(1_000_000),
      makeEntry(500_000, { Peer: "0xabc" }),
      makeEntry(250_000),
    ];
    expect(computeEffectiveCredit(entries)).toBe(1_750_000n);
  });
});

describe("formatCredit", () => {
  it("formats MB without fractional digits", () => {
    expect(formatCredit(BYTES_PER_MB)).toMatch(/^1 MB$/);
  });

  it("formats large values without Number precision loss", () => {
    const creditBytes = BYTES_PER_TB * 3n + BYTES_PER_TB / 2n;
    const formattedCredit = formatCredit(creditBytes);
    expect(formattedCredit).toMatch(/ TB$/);
    expect(formattedCredit).not.toContain("Infinity");
  });
});

