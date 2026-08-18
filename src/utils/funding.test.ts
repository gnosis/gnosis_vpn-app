import { describe, expect, it } from "vitest";
import {
  deriveNodeStatus,
  deriveOverallStatus,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  deriveXdaiDeficit,
  TRAFFIC_EMPTY_BELOW,
  TRAFFIC_LOW_BELOW,
  XDAI_EMPTY_BELOW,
  XDAI_LOW_BELOW,
} from "./funding.ts";
import type {
  BalanceResponse,
  Capacity,
  CapacityEntry,
} from "@src/services/vpnService.ts";

const XDAI_OK = 10_000_000_000_000_000n; // 0.01 xDAI

function makeCapacity(byte_capacity: number): Capacity {
  return {
    stake: 0n,
    expected_messages: 0,
    min_guaranteed_messages: 0,
    byte_capacity,
  };
}

function makeEntry(
  byte_capacity: number,
  allocator: CapacityEntry["allocator"] = { type: "safe" },
): CapacityEntry {
  return { allocator, capacity: makeCapacity(byte_capacity) };
}

function makeBalance(opts: {
  allocationBytes?: number[] | null;
  nodeEoaBytes?: number;
  node?: bigint;
  stake?: bigint;
  ideal?: { wxhopr?: bigint; xdai?: bigint };
}): BalanceResponse {
  const entries = (opts.allocationBytes ?? []).map((b) => makeEntry(b));
  if (opts.nodeEoaBytes !== undefined) {
    entries.push(makeEntry(opts.nodeEoaBytes, { type: "node_eoa" }));
  }
  if (opts.stake !== undefined && entries.length > 0) {
    entries[0].capacity.stake = opts.stake;
  }
  return {
    node: opts.node ?? XDAI_OK,
    safe: 0n,
    channels_out: 0n,
    info: { node_address: "0x0", node_peer_id: "", safe_address: "0x0" },
    funding_issues: null,
    ideal_balance: opts.ideal
      ? {
        wxhopr: opts.ideal.wxhopr ?? 0n,
        xdai: opts.ideal.xdai ?? 0n,
        channel_stakes: 0n,
        fee_to_start: 0n,
        txs_to_start: 0,
        xdai_fee_per_tx: 0n,
      }
      : null,
    capacity_allocations: opts.allocationBytes === null ? null : entries,
  };
}

describe("deriveTrafficStatus", () => {
  it("applies the 3 GB / 5 GB thresholds to total byte capacity", () => {
    const cases: [number, string][] = [
      [Number(TRAFFIC_EMPTY_BELOW) - 1, "Empty"],
      [Number(TRAFFIC_EMPTY_BELOW), "Low"],
      [Number(TRAFFIC_LOW_BELOW) - 1, "Low"],
      [Number(TRAFFIC_LOW_BELOW), "Sufficient"],
    ];
    for (const [bytes, expected] of cases) {
      const balance = makeBalance({ allocationBytes: [bytes] });
      expect(deriveTrafficStatus(balance, []), `bytes = ${bytes}`).toBe(
        expected,
      );
    }
  });

  it("counts allocations and the node EOA entry together", () => {
    const twoGb = Number(TRAFFIC_EMPTY_BELOW) / 3 * 2;
    const threeGb = Number(TRAFFIC_EMPTY_BELOW);
    const balance = makeBalance({
      allocationBytes: [twoGb],
      nodeEoaBytes: threeGb,
    });
    expect(deriveTrafficStatus(balance, [])).toBe("Sufficient");
  });

  it("overrides stale funding issues when capacity is sufficient", () => {
    const balance = makeBalance({
      allocationBytes: [Number(TRAFFIC_LOW_BELOW)],
    });
    expect(deriveTrafficStatus(balance, ["ChannelsOutOfFunds"])).toBe(
      "Sufficient",
    );
  });

  it("falls back to funding issues without a balance", () => {
    expect(deriveTrafficStatus(null, [])).toBe("Sufficient");
    expect(deriveTrafficStatus(null, ["SafeLowOnFunds"])).toBe("Low");
    expect(deriveTrafficStatus(null, ["Unfunded"])).toBe("Empty");
    expect(deriveTrafficStatus(null, ["ChannelsOutOfFunds"])).toBe("Empty");
    expect(deriveTrafficStatus(null, ["SafeOutOfFunds"])).toBe("Empty");
  });

  it("falls back to funding issues while all capacity data is missing", () => {
    const balance = makeBalance({ allocationBytes: null });
    expect(deriveTrafficStatus(balance, ["SafeLowOnFunds"])).toBe("Low");
  });

  it("counts freshly deposited EOA funds via the node_eoa entry", () => {
    // Freshly deposited funds sit on the node EOA before the sweep; they
    // arrive as the node_eoa allocation entry, and the daemon's
    // channel-scoped issues must not paint that as empty.
    const funded = makeBalance({
      allocationBytes: [],
      nodeEoaBytes: Number(TRAFFIC_LOW_BELOW),
    });
    expect(deriveTrafficStatus(funded, ["ChannelsOutOfFunds"])).toBe(
      "Sufficient",
    );

    // With allocations present, thresholds decide — not the issues.
    const empty = makeBalance({ allocationBytes: [], nodeEoaBytes: 0 });
    expect(deriveTrafficStatus(empty, [])).toBe("Empty");
  });
});

describe("deriveNodeStatus", () => {
  it("applies the 0.0015 / 0.0035 xDAI thresholds to the node balance", () => {
    const cases: [bigint, string][] = [
      [XDAI_EMPTY_BELOW - 1n, "Empty"],
      [XDAI_EMPTY_BELOW, "Low"],
      [XDAI_LOW_BELOW - 1n, "Low"],
      [XDAI_LOW_BELOW, "Sufficient"],
    ];
    for (const [node, expected] of cases) {
      const balance = makeBalance({ allocationBytes: [], node });
      expect(deriveNodeStatus(balance, []), `node = ${node}`).toBe(expected);
    }
  });

  it("ignores traffic-only issues", () => {
    const balance = makeBalance({ allocationBytes: [], node: XDAI_LOW_BELOW });
    expect(deriveNodeStatus(balance, ["ChannelsOutOfFunds"])).toBe(
      "Sufficient",
    );
    expect(deriveNodeStatus(null, ["ChannelsOutOfFunds"])).toBe("Sufficient");
  });

  it("falls back to funding issues without a balance", () => {
    expect(deriveNodeStatus(null, [])).toBe("Sufficient");
    expect(deriveNodeStatus(null, ["NodeLowOnFunds"])).toBe("Low");
    expect(deriveNodeStatus(null, ["NodeUnderfunded"])).toBe("Empty");
    expect(deriveNodeStatus(null, ["Unfunded"])).toBe("Empty");
  });
});

const WXHOPR_IDEAL = 2_000_000_000_000_000_000n; // 2 wxHOPR
const XDAI_IDEAL = 50_000_000_000_000_000n; // 0.05 xDAI

describe("deriveWxhoprDeficit", () => {
  it("returns null while traffic is Sufficient, even with a positive diff", () => {
    const balance = makeBalance({
      allocationBytes: [Number(TRAFFIC_LOW_BELOW)],
      ideal: { wxhopr: WXHOPR_IDEAL },
    });
    expect(deriveWxhoprDeficit(balance, [])).toBeNull();
    // Stale daemon issues must not resurface the recommendation.
    expect(deriveWxhoprDeficit(balance, ["SafeLowOnFunds"])).toBeNull();
  });

  it("returns the diff to edgli's recommendation when traffic is Low/Empty", () => {
    const stake = 500_000_000_000_000_000n;
    const low = makeBalance({
      allocationBytes: [Number(TRAFFIC_EMPTY_BELOW)],
      stake,
      ideal: { wxhopr: WXHOPR_IDEAL },
    });
    expect(deriveWxhoprDeficit(low, [])).toBe(WXHOPR_IDEAL - stake);

    const empty = makeBalance({
      allocationBytes: [0],
      ideal: { wxhopr: WXHOPR_IDEAL },
    });
    expect(deriveWxhoprDeficit(empty, [])).toBe(WXHOPR_IDEAL);
  });

  it("does not require daemon funding issues", () => {
    const balance = makeBalance({
      allocationBytes: [0],
      ideal: { wxhopr: WXHOPR_IDEAL },
    });
    expect(deriveWxhoprDeficit(balance, [])).toBe(WXHOPR_IDEAL);
  });

  it("returns null without a balance or recommendation", () => {
    expect(deriveWxhoprDeficit(null, ["SafeLowOnFunds"])).toBeNull();
    const noIdeal = makeBalance({ allocationBytes: [0] });
    expect(deriveWxhoprDeficit(noIdeal, [])).toBeNull();
  });

  it("clamps a non-positive diff to null", () => {
    const balance = makeBalance({
      allocationBytes: [0],
      stake: WXHOPR_IDEAL,
      ideal: { wxhopr: WXHOPR_IDEAL },
    });
    expect(deriveWxhoprDeficit(balance, [])).toBeNull();
  });
});

describe("deriveXdaiDeficit", () => {
  it("returns null while gas is Sufficient, even with a positive diff", () => {
    // node holds 0.01 xDAI (Sufficient) but edgli recommends 0.05 — the
    // modal must not recommend topping up.
    const balance = makeBalance({
      allocationBytes: [],
      node: XDAI_OK,
      ideal: { xdai: XDAI_IDEAL },
    });
    expect(deriveXdaiDeficit(balance, [])).toBeNull();
    expect(deriveXdaiDeficit(balance, ["NodeLowOnFunds"])).toBeNull();
  });

  it("returns the diff to edgli's recommendation when gas is Low/Empty", () => {
    const node = XDAI_LOW_BELOW - 1n;
    const balance = makeBalance({
      allocationBytes: [],
      node,
      ideal: { xdai: XDAI_IDEAL },
    });
    expect(deriveXdaiDeficit(balance, [])).toBe(XDAI_IDEAL - node);
  });

  it("does not require daemon funding issues", () => {
    const balance = makeBalance({
      allocationBytes: [],
      node: 0n,
      ideal: { xdai: XDAI_IDEAL },
    });
    expect(deriveXdaiDeficit(balance, [])).toBe(XDAI_IDEAL);
  });

  it("returns null without a balance or recommendation", () => {
    expect(deriveXdaiDeficit(null, ["NodeLowOnFunds"])).toBeNull();
    const noIdeal = makeBalance({ allocationBytes: [], node: 0n });
    expect(deriveXdaiDeficit(noIdeal, [])).toBeNull();
  });

  it("clamps a non-positive diff to null", () => {
    const balance = makeBalance({
      allocationBytes: [],
      node: XDAI_EMPTY_BELOW,
      ideal: { xdai: XDAI_EMPTY_BELOW },
    });
    expect(deriveXdaiDeficit(balance, [])).toBeNull();
  });
});

describe("deriveOverallStatus", () => {
  it("returns the worst of traffic and gas", () => {
    // plenty of traffic, no gas
    const noGas = makeBalance({
      allocationBytes: [Number(TRAFFIC_LOW_BELOW)],
      node: 0n,
    });
    expect(deriveOverallStatus(noGas, [])).toBe("Empty");

    // plenty of gas, no traffic
    const noTraffic = makeBalance({ allocationBytes: [0] });
    expect(deriveOverallStatus(noTraffic, [])).toBe("Empty");

    // low traffic, sufficient gas
    const lowTraffic = makeBalance({
      allocationBytes: [Number(TRAFFIC_EMPTY_BELOW)],
    });
    expect(deriveOverallStatus(lowTraffic, [])).toBe("Low");

    // both fine
    const funded = makeBalance({
      allocationBytes: [Number(TRAFFIC_LOW_BELOW)],
    });
    expect(deriveOverallStatus(funded, [])).toBe("Sufficient");
  });
});
