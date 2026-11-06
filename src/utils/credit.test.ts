import { describe, expect, it } from "vitest";
import {
  computeEffectiveCredit,
  exitsCovered,
  formatCredit,
  formatCreditCompact,
} from "./credit.ts";
import type {
  BalanceResponse,
  Capacity,
  CapacityAllocations,
} from "@src/services/vpnService.ts";

const BYTES_PER_MB = 1_048_576n;
const BYTES_PER_GB = BYTES_PER_MB * 1024n;
const BYTES_PER_TB = BYTES_PER_GB * 1024n;

function makeCapacity(byte_capacity: number, stake = 0n): Capacity {
  return {
    stake,
    expected_messages: 0,
    min_guaranteed_messages: 0,
    byte_capacity,
  };
}

function makeAllocations(
  parts: Partial<CapacityAllocations>,
): CapacityAllocations {
  return {
    peer_allocations: {},
    node: makeCapacity(0),
    safe: makeCapacity(0),
    ...parts,
  };
}

function makeBalance(
  capacity_allocations: CapacityAllocations | null,
): BalanceResponse {
  return {
    node: 0n,
    safe: 0n,
    channels_out: 0n,
    info: { node_address: "0x0", node_peer_id: "", safe_address: "0x0" },
    funding_status: null,
    ideal_balance: null,
    capacity_allocations,
  };
}

describe("computeEffectiveCredit", () => {
  it("returns 0 for all-zero allocations", () => {
    expect(computeEffectiveCredit(makeBalance(makeAllocations({})))).toBe(0n);
  });

  it("returns 0 when allocations are missing", () => {
    expect(computeEffectiveCredit(makeBalance(null))).toBe(0n);
  });

  it("sums bytes from the safe part", () => {
    expect(
      computeEffectiveCredit(
        makeBalance(makeAllocations({ safe: makeCapacity(1_000_000) })),
      ),
    ).toBe(1_000_000n);
  });

  it("sums bytes from a single peer allocation", () => {
    expect(
      computeEffectiveCredit(
        makeBalance(
          makeAllocations({
            peer_allocations: { "0xabc": makeCapacity(500_000) },
          }),
        ),
      ),
    ).toBe(500_000n);
  });

  it("sums bytes across safe and peer allocations", () => {
    const allocations = makeAllocations({
      safe: makeCapacity(1_000_000),
      peer_allocations: {
        "0xabc": makeCapacity(500_000),
        "0xdef": makeCapacity(250_000),
      },
    });
    expect(computeEffectiveCredit(makeBalance(allocations))).toBe(1_750_000n);
  });

  it("includes the node EOA part", () => {
    const allocations = makeAllocations({
      safe: makeCapacity(1_000_000),
      node: makeCapacity(500_000),
    });
    expect(computeEffectiveCredit(makeBalance(allocations))).toBe(1_500_000n);
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

describe("formatCreditCompact", () => {
  const tenthsOf = (unit: bigint, tenths: bigint) => unit * tenths / 10n;

  it("keeps whole numbers from 100 up to 999", () => {
    expect(formatCreditCompact(BYTES_PER_GB * 999n)).toBe("999 GB");
    expect(formatCreditCompact(BYTES_PER_GB * 100n)).toBe("100 GB");
    expect(formatCreditCompact(BYTES_PER_MB * 999n)).toBe("999 MB");
  });

  it("adds one decimal below 100, never more", () => {
    expect(formatCreditCompact(BYTES_PER_GB * 987n / 100n)).toBe("9.9 GB");
    expect(formatCreditCompact(tenthsOf(BYTES_PER_GB, 999n))).toBe("99.9 GB");
    expect(formatCreditCompact(tenthsOf(BYTES_PER_GB, 48n))).toBe("4.8 GB");
    expect(formatCreditCompact(tenthsOf(BYTES_PER_MB, 999n))).toBe("99.9 MB");
    expect(formatCreditCompact(tenthsOf(BYTES_PER_MB, 5n))).toBe("0.5 MB");
  });

  it("rounds up into the next format instead of growing a digit", () => {
    expect(formatCreditCompact(BYTES_PER_MB * 9996n / 100n)).toBe("100 MB");
    expect(formatCreditCompact(tenthsOf(BYTES_PER_MB, 9996n))).toBe("1.0 GB");
    expect(formatCreditCompact(BYTES_PER_GB * 1000n)).toBe("1.0 TB");
    expect(formatCreditCompact(BYTES_PER_TB * 1001n)).toBe("1.0 PB");
  });

  it("keeps three digits for the largest balances", () => {
    expect(formatCreditCompact(BYTES_PER_TB * 999n)).toBe("999 TB");
    expect(formatCreditCompact(2n ** 64n - 1n)).toBe("16.0 EB");
    expect(formatCreditCompact(BYTES_PER_TB * 1024n ** 4n * 999n)).toBe(
      "999 YB",
    );
    expect(formatCreditCompact(BYTES_PER_TB * 1024n ** 4n * 1000n)).toBe(
      "999+ YB",
    );
  });

  it("shows an empty balance as whole MB", () => {
    expect(formatCreditCompact(0n)).toBe("0 MB");
  });
});

describe("exitsCovered", () => {
  it("counts whole 600 MB exits, rounding down", () => {
    expect(exitsCovered(BYTES_PER_MB * 4800n)).toBe(8n);
    expect(exitsCovered(BYTES_PER_MB * 1199n)).toBe(1n);
    expect(exitsCovered(BYTES_PER_MB * 599n)).toBe(0n);
    expect(exitsCovered(0n)).toBe(0n);
  });
});
