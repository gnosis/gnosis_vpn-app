import { describe, expect, it } from "vitest";
import {
  deriveNodeStatus,
  deriveOverallStatus,
  deriveTrafficStatus,
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

function makeEntry(byte_capacity: number): CapacityEntry {
  return { allocator: { type: "safe" }, capacity: makeCapacity(byte_capacity) };
}

function makeBalance(opts: {
  allocationBytes?: number[] | null;
  nodeCapacityBytes?: number;
  node?: bigint;
}): BalanceResponse {
  return {
    node: opts.node ?? XDAI_OK,
    safe: 0n,
    channels_out: 0n,
    info: { node_address: "0x0", node_peer_id: "", safe_address: "0x0" },
    funding_issues: null,
    ideal_balance: null,
    capacity_allocations: opts.allocationBytes === null
      ? null
      : (opts.allocationBytes ?? []).map(makeEntry),
    node_capacity: opts.nodeCapacityBytes !== undefined
      ? makeCapacity(opts.nodeCapacityBytes)
      : null,
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

  it("counts allocations and node EOA capacity together", () => {
    const twoGb = Number(TRAFFIC_EMPTY_BELOW) / 3 * 2;
    const threeGb = Number(TRAFFIC_EMPTY_BELOW);
    const balance = makeBalance({
      allocationBytes: [twoGb],
      nodeCapacityBytes: threeGb,
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

  it("falls back to funding issues while allocations are missing", () => {
    const balance = makeBalance({ allocationBytes: null });
    expect(deriveTrafficStatus(balance, ["SafeLowOnFunds"])).toBe("Low");
  });
});

describe("deriveNodeStatus", () => {
  it("applies the 0.003 / 0.005 xDAI thresholds to the node balance", () => {
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
