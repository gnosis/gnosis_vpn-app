import { describe, expect, it } from "vitest";
import {
  computeCreditBytes,
  computeEffectiveCredit,
  computeHoprPerGb,
  formatCredit,
} from "./credit.ts";

/** Must match `credit.ts` (`BYTES_PER_MB`). */
const BYTES_PER_MB = 1_048_576n;
const BYTES_PER_TB = BYTES_PER_MB * 1024n * 1024n;

describe("computeCreditBytes", () => {
  it("returns 0 when ticket value is zero", () => {
    expect(computeCreditBytes("1000", "0")).toBe(0n);
  });

  it("returns 0 when channels balance is zero", () => {
    expect(computeCreditBytes("0", "1000000000000000000")).toBe(0n);
  });

  it("computes messages times payload", () => {
    const ticketValueWei = "650000000000000000000"; // 650 * 1e18 wei
    const channelsOutWei = "1300000000000000000000"; // 2 × ticket → 2 messages
    expect(computeCreditBytes(channelsOutWei, ticketValueWei)).toBe(1300n);
  });

  it("returns 0 on invalid input", () => {
    expect(computeCreditBytes("not-a-number", "1")).toBe(0n);
  });
});

describe("computeEffectiveCredit", () => {
  it("sums channels and safe before computing bytes", () => {
    const ticketValueWei = "650000000000000000000"; // 650 * 1e18 wei per message
    const channelsOutWei = "1300000000000000000000"; // 2 messages worth
    const safeWei = "1950000000000000000000"; // 3 messages worth
    // total = 5 messages * 650 bytes = 3250
    expect(
      computeEffectiveCredit(channelsOutWei, safeWei, ticketValueWei),
    ).toBe(3250n);
  });

  it("returns 0 when both balances are zero", () => {
    expect(computeEffectiveCredit("0", "0", "1000000000000000000")).toBe(0n);
  });

  it("uses safe alone when channels are empty", () => {
    const ticketValueWei = "650000000000000000000";
    const safeWei = "1300000000000000000000"; // 2 messages → 1300 bytes
    expect(computeEffectiveCredit("0", safeWei, ticketValueWei)).toBe(1300n);
  });

  it("returns 0 on invalid input", () => {
    expect(computeEffectiveCredit("not-a-number", "0", "1")).toBe(0n);
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

describe("computeHoprPerGb", () => {
  it("returns em dash for zero ticket value", () => {
    expect(computeHoprPerGb("0")).toBe("—");
  });

  it("formats normal rates with two fractional digits", () => {
    const ticketValueWei = "1000000000000000000";
    const hoprPerGb = computeHoprPerGb(ticketValueWei);
    expect(hoprPerGb).not.toBe("—");
    expect(hoprPerGb).toMatch(/^\d+\.\d{2}$/);
  });

  it("uses extra precision for very small per-GB rates", () => {
    const ticketValueWei = "5000000000"; // per-GB wei below WEI_PER_TOKEN / 100
    const hoprPerGb = computeHoprPerGb(ticketValueWei);
    expect(hoprPerGb).not.toBe("—");
    expect(hoprPerGb.startsWith("0.")).toBe(true);
  });
});

describe("hop-aware credit", () => {
  const ticketValueWei = "1000000000000000000"; // 1 token per message
  // 10 messages → 6500 bytes at 1 hop
  const channelsOutWei = "10000000000000000000";

  it("computeCreditBytes halves bytes for 2 hops", () => {
    const one = computeCreditBytes(channelsOutWei, ticketValueWei, 1);
    const two = computeCreditBytes(channelsOutWei, ticketValueWei, 2);
    expect(two).toBe(one / 2n);
  });

  it("computeCreditBytes floors to whole sendable messages per n hops", () => {
    // 10 messages of budget; each hop multiplies ticket cost
    // hops=3 → floor(10/3)=3 messages → 3*650=1950 bytes
    expect(computeCreditBytes(channelsOutWei, ticketValueWei, 3)).toBe(1950n);
    // hops=4 → floor(10/4)=2 messages → 2*650=1300 bytes
    expect(computeCreditBytes(channelsOutWei, ticketValueWei, 4)).toBe(1300n);
    // hops=5 → floor(10/5)=2 messages → 2*650=1300 bytes
    expect(computeCreditBytes(channelsOutWei, ticketValueWei, 5)).toBe(1300n);
  });

  it("computeHoprPerGb doubles for 2 hops", () => {
    const rate1 = computeHoprPerGb(ticketValueWei, 1);
    const rate2 = computeHoprPerGb(ticketValueWei, 2);
    expect(parseFloat(rate2)).toBeCloseTo(parseFloat(rate1) * 2, 1);
  });

  it("computeEffectiveCredit uses 1-hop bytes when hops=1 (default)", () => {
    const ec1 = computeEffectiveCredit("0", channelsOutWei, ticketValueWei);
    const ec1explicit = computeEffectiveCredit(
      "0",
      channelsOutWei,
      ticketValueWei,
      1,
    );
    expect(ec1).toBe(ec1explicit);
  });
});
