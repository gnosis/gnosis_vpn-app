import { describe, expect, it } from "vitest";
import {
  computeEffectiveCredit,
  formatCredit,
  sumCapacityStake,
} from "./credit.ts";
import type {
  BalanceResponse,
  Capacity,
  CapacityEntry,
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

function makeEntry(
  byte_capacity: number,
  stake = 0n,
  allocator: CapacityEntry["allocator"] = { type: "safe" },
): CapacityEntry {
  return { allocator, capacity: makeCapacity(byte_capacity, stake) };
}

function makeBalance(
  capacity_allocations: CapacityEntry[] | null,
  node_capacity: Capacity | null = null,
): BalanceResponse {
  return {
    node: 0n,
    safe: 0n,
    channels_out: 0n,
    info: { node_address: "0x0", node_peer_id: "", safe_address: "0x0" },
    funding_issues: null,
    ideal_balance: null,
    capacity_allocations,
    node_capacity,
  };
}

describe("computeEffectiveCredit", () => {
  it("returns 0 for empty allocations", () => {
    expect(computeEffectiveCredit(makeBalance([]))).toBe(0n);
  });

  it("returns 0 when allocations are missing", () => {
    expect(computeEffectiveCredit(makeBalance(null))).toBe(0n);
  });

  it("sums bytes from a single safe allocation", () => {
    expect(computeEffectiveCredit(makeBalance([makeEntry(1_000_000)]))).toBe(
      1_000_000n,
    );
  });

  it("sums bytes from a single peer allocation", () => {
    expect(
      computeEffectiveCredit(
        makeBalance([makeEntry(500_000, 0n, { type: "peer", address: "0xabc" })]),
      ),
    ).toBe(500_000n);
  });

  it("sums bytes across mixed safe and peer allocations", () => {
    const entries = [
      makeEntry(1_000_000),
      makeEntry(500_000, 0n, { type: "peer", address: "0xabc" }),
      makeEntry(250_000),
    ];
    expect(computeEffectiveCredit(makeBalance(entries))).toBe(1_750_000n);
  });

  it("includes the node EOA capacity", () => {
    expect(
      computeEffectiveCredit(
        makeBalance([makeEntry(1_000_000)], makeCapacity(500_000)),
      ),
    ).toBe(1_500_000n);
  });
});

describe("sumCapacityStake", () => {
  it("returns 0 for empty allocations", () => {
    expect(sumCapacityStake(makeBalance([]))).toBe(0n);
  });

  it("sums stake across safe and peer allocations", () => {
    const entries = [
      makeEntry(0, 1_000_000_000_000_000_000n),
      makeEntry(0, 500_000_000_000_000_000n, {
        type: "peer",
        address: "0xabc",
      }),
    ];
    expect(sumCapacityStake(makeBalance(entries))).toBe(
      1_500_000_000_000_000_000n,
    );
  });

  it("includes the node EOA stake", () => {
    expect(
      sumCapacityStake(
        makeBalance(
          [makeEntry(0, 1_000_000_000_000_000_000n)],
          makeCapacity(0, 500_000_000_000_000_000n),
        ),
      ),
    ).toBe(1_500_000_000_000_000_000n);
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
