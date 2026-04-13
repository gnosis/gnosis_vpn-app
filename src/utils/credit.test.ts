import { describe, expect, it } from "vitest";
import {
  computeCreditBytes,
  computeEffectiveCredit,
  computeHoprPerGb,
  formatCredit,
} from "./credit.ts";

/** Must match `credit.ts` (`PAYLOAD_BYTES_PER_MESSAGE`, `BYTES_PER_MB`, `WEI_PER_TOKEN`). */
const PAYLOAD_BYTES_PER_MESSAGE = 650n;
const BYTES_PER_MB = 1_048_576n;
const WEI_PER_TOKEN = 10n ** 18n;
const BYTES_PER_TB = BYTES_PER_MB * 1024n * 1024n;

/**
 * Smallest integer message count where
 * `messageCount * PAYLOAD_BYTES_PER_MESSAGE >= BYTES_PER_MB`
 * (same 1 MiB cutoff as `computeEffectiveCredit`).
 * ceil(BYTES_PER_MB / PAYLOAD_BYTES_PER_MESSAGE) → 1614.
 */
const MIN_MESSAGES_AT_OR_ABOVE_1MIB =
  (BYTES_PER_MB + PAYLOAD_BYTES_PER_MESSAGE - 1n) / PAYLOAD_BYTES_PER_MESSAGE;

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
  it("uses channel bytes when at or above 1 MB", () => {
    const ticketValueWei = "1000000000000000000"; // 1 * WEI_PER_TOKEN wei per message
    const channelsOutWei = (MIN_MESSAGES_AT_OR_ABOVE_1MIB * WEI_PER_TOKEN)
      .toString();
    const effectiveCredit = computeEffectiveCredit(
      channelsOutWei,
      "0",
      ticketValueWei,
    );
    expect(effectiveCredit.isEstimate).toBe(false);
    expect(effectiveCredit.bytes).toBe(
      MIN_MESSAGES_AT_OR_ABOVE_1MIB * PAYLOAD_BYTES_PER_MESSAGE,
    );
    expect(effectiveCredit.bytes >= BYTES_PER_MB).toBe(true);
  });

  it("keeps non-zero channel credit below 1 MB when safe is zero", () => {
    const ticketValueWei = "650000000000000000000";
    const channelsOutWei = "1300000000000000000000"; // 2 messages → 1300 bytes
    const effectiveCredit = computeEffectiveCredit(
      channelsOutWei,
      "0",
      ticketValueWei,
    );
    expect(effectiveCredit.bytes).toBe(1300n);
    expect(effectiveCredit.isEstimate).toBe(false);
  });

  it("uses safe as estimate when channel is below threshold and safe has credit", () => {
    const ticketValueWei = "650000000000000000000";
    const channelsOut = "0";
    const safe = "1300000000000000000000";
    const effectiveCredit = computeEffectiveCredit(
      channelsOut,
      safe,
      ticketValueWei,
    );
    expect(effectiveCredit.bytes).toBe(1300n);
    expect(effectiveCredit.isEstimate).toBe(true);
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
