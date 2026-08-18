import { describe, expect, it } from "vitest";
import {
  computeEffectiveCredit,
  formatCredit,
  sumCapacityStake,
} from "./credit.ts";
import type {
  BalanceResponse,
  Capacity,
  CapacityAllocations,
} from "@src/services/vpnService.ts";

const BYTES_PER_MB = 1_048_576n;
const BYTES_PER_TB = BYTES_PER_MB * 1024n * 1024n;

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
    funding_issues: null,
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

describe("sumCapacityStake", () => {
  it("returns 0 for all-zero allocations", () => {
    expect(sumCapacityStake(makeBalance(makeAllocations({})))).toBe(0n);
  });

  it("sums stake across safe and peer allocations", () => {
    const allocations = makeAllocations({
      safe: makeCapacity(0, 1_000_000_000_000_000_000n),
      peer_allocations: { "0xabc": makeCapacity(0, 500_000_000_000_000_000n) },
    });
    expect(sumCapacityStake(makeBalance(allocations))).toBe(
      1_500_000_000_000_000_000n,
    );
  });

  it("includes the node EOA stake", () => {
    const allocations = makeAllocations({
      safe: makeCapacity(0, 1_000_000_000_000_000_000n),
      node: makeCapacity(0, 500_000_000_000_000_000n),
    });
    expect(sumCapacityStake(makeBalance(allocations))).toBe(
      1_500_000_000_000_000_000n,
    );
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
