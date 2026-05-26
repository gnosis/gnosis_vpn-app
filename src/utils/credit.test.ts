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
  it("returns 0 when ticket price is zero", () => {
    expect(computeCreditBytes("1000", "0", 1)).toBe(0n);
  });

  it("returns 0 when channels balance is zero", () => {
    expect(computeCreditBytes("0", "1000000000000000000", 1)).toBe(0n);
  });

  it("returns 0 when winning probability is zero", () => {
    expect(computeCreditBytes("1000000000000000000", "1", 0)).toBe(0n);
  });

  it("computes messages times payload at win_prob=1", () => {
    const ticketPriceWei = "650000000000000000000"; // 650 * 1e18 wei
    const channelsOutWei = "1300000000000000000000"; // 2 × ticket → 2 messages
    expect(computeCreditBytes(channelsOutWei, ticketPriceWei, 1)).toBe(1300n);
  });

  it("divides ticket_price by winning_probability when computing cost", () => {
    // ticket_price = 1e10 wei, win_prob = 1e-3 → effective cost = 1e13 wei/msg
    // balance = 1e16 wei → 1000 messages × 650 bytes = 650_000 bytes
    expect(computeCreditBytes("10000000000000000", "10000000000", 0.001)).toBe(
      650_000n,
    );
  });

  it("returns 0 on invalid input", () => {
    expect(computeCreditBytes("not-a-number", "1", 1)).toBe(0n);
  });
});

describe("computeEffectiveCredit", () => {
  it("sums channels and safe before computing bytes", () => {
    const ticketPriceWei = "650000000000000000000"; // 650 * 1e18 wei per message at win_prob=1
    const channelsOutWei = "1300000000000000000000"; // 2 messages worth
    const safeWei = "1950000000000000000000"; // 3 messages worth
    // total = 5 messages * 650 bytes = 3250
    expect(
      computeEffectiveCredit(channelsOutWei, safeWei, ticketPriceWei, 1),
    ).toBe(3250n);
  });

  it("returns 0 when both balances are zero", () => {
    expect(computeEffectiveCredit("0", "0", "1000000000000000000", 1)).toBe(0n);
  });

  it("uses safe alone when channels are empty", () => {
    const ticketPriceWei = "650000000000000000000";
    const safeWei = "1300000000000000000000"; // 2 messages → 1300 bytes
    expect(computeEffectiveCredit("0", safeWei, ticketPriceWei, 1)).toBe(1300n);
  });

  it("returns 0 on invalid input", () => {
    expect(computeEffectiveCredit("not-a-number", "0", "1", 1)).toBe(0n);
  });

  it("applies winning_probability to the combined pool", () => {
    // Combined balance 3e16 wei, ticket_price 86 wei, win_prob 4.5e-9
    // → cost/msg ≈ 86/4.5e-9 ≈ 1.91e10 wei
    // → ~1.57e6 messages × 650 ≈ 1.02e9 bytes ≈ 975 MB (well below the
    //   206,910 TB the naïve formula produced)
    const bytes = computeEffectiveCredit(
      "30000000000000000",
      "0",
      "86",
      4.5e-9,
    );
    // sanity: result must be well under 2 GB, not TB
    expect(bytes).toBeLessThan(2n * 1024n * BYTES_PER_MB);
    expect(bytes).toBeGreaterThan(900n * BYTES_PER_MB);
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
    expect(computeHoprPerGb("0", 1)).toBe("—");
  });

  it("returns em dash for zero winning probability", () => {
    expect(computeHoprPerGb("1000000000000000000", 0)).toBe("—");
  });

  it("formats normal rates with two fractional digits", () => {
    const ticketPriceWei = "1000000000000000000";
    const hoprPerGb = computeHoprPerGb(ticketPriceWei, 1);
    expect(hoprPerGb).not.toBe("—");
    expect(hoprPerGb).toMatch(/^\d+\.\d{2}$/);
  });

  it("uses extra precision for very small per-GB rates", () => {
    const ticketPriceWei = "5000000000"; // per-GB wei below WEI_PER_TOKEN / 100
    const hoprPerGb = computeHoprPerGb(ticketPriceWei, 1);
    expect(hoprPerGb).not.toBe("—");
    expect(hoprPerGb.startsWith("0.")).toBe(true);
  });

  it("scales rate by 1/winning_probability", () => {
    const ticketPriceWei = "1000000000000000000";
    const rateFull = computeHoprPerGb(ticketPriceWei, 1);
    const rateHalf = computeHoprPerGb(ticketPriceWei, 0.5);
    expect(parseFloat(rateHalf)).toBeCloseTo(parseFloat(rateFull) * 2, 1);
  });
});

describe("hop-aware credit", () => {
  const ticketPriceWei = "1000000000000000000"; // 1 token per message at win_prob=1
  // 10 messages → 6500 bytes at 1 hop
  const channelsOutWei = "10000000000000000000";

  it("computeCreditBytes halves bytes for 2 hops", () => {
    const one = computeCreditBytes(channelsOutWei, ticketPriceWei, 1, 1);
    const two = computeCreditBytes(channelsOutWei, ticketPriceWei, 1, 2);
    expect(two).toBe(one / 2n);
  });

  it("computeCreditBytes floors to whole sendable messages per n hops", () => {
    // 10 messages of budget; each hop multiplies ticket cost
    // hops=3 → floor(10/3)=3 messages → 3*650=1950 bytes
    expect(computeCreditBytes(channelsOutWei, ticketPriceWei, 1, 3)).toBe(
      1950n,
    );
    // hops=4 → floor(10/4)=2 messages → 2*650=1300 bytes
    expect(computeCreditBytes(channelsOutWei, ticketPriceWei, 1, 4)).toBe(
      1300n,
    );
    // hops=5 → floor(10/5)=2 messages → 2*650=1300 bytes
    expect(computeCreditBytes(channelsOutWei, ticketPriceWei, 1, 5)).toBe(
      1300n,
    );
  });

  it("computeHoprPerGb doubles for 2 hops", () => {
    const rate1 = computeHoprPerGb(ticketPriceWei, 1, 1);
    const rate2 = computeHoprPerGb(ticketPriceWei, 1, 2);
    expect(parseFloat(rate2)).toBeCloseTo(parseFloat(rate1) * 2, 1);
  });

  it("computeEffectiveCredit uses 1-hop bytes when hops=1 (default)", () => {
    const ec1 = computeEffectiveCredit("0", channelsOutWei, ticketPriceWei, 1);
    const ec1explicit = computeEffectiveCredit(
      "0",
      channelsOutWei,
      ticketPriceWei,
      1,
      1,
    );
    expect(ec1).toBe(ec1explicit);
  });
});
