import { describe, expect, it } from "vitest";
import {
  deriveNodeStatus,
  deriveOverallStatus,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  deriveXdaiDeficit,
  describeCriticalIssue,
} from "./funding.ts";
import type {
  BalanceResponse,
  FundingStatus,
} from "@src/services/vpnService.ts";

function makeStatus(
  traffic: FundingStatus["traffic"],
  gas: FundingStatus["gas"],
  opts: {
    wxhoprDeficit?: bigint;
    xdaiDeficit?: bigint;
    refillShortfall?: bigint;
  } = {},
): FundingStatus {
  return {
    traffic,
    gas,
    wxhopr_deficit: opts.wxhoprDeficit ?? null,
    xdai_deficit: opts.xdaiDeficit ?? null,
    refill_shortfall: opts.refillShortfall ?? null,
  };
}

function makeBalance(status: FundingStatus | null): BalanceResponse {
  return {
    node: 0n,
    safe: 0n,
    channels_out: 0n,
    info: { node_address: "0x0", node_peer_id: "", safe_address: "0x0" },
    funding_status: status,
    ideal_balance: null,
    capacity_allocations: null,
  };
}

describe("deriveTrafficStatus", () => {
  it("maps the daemon's traffic level to the UI status text", () => {
    expect(deriveTrafficStatus(makeBalance(makeStatus("good", "good")), null))
      .toBe("Sufficient");
    expect(deriveTrafficStatus(makeBalance(makeStatus("low", "good")), null))
      .toBe("Low");
    expect(deriveTrafficStatus(makeBalance(makeStatus("empty", "good")), null))
      .toBe("Empty");
  });

  it("defaults to Sufficient without any status yet", () => {
    expect(deriveTrafficStatus(null, null)).toBe("Sufficient");
    expect(deriveTrafficStatus(makeBalance(null), null)).toBe("Sufficient");
  });

  it("falls back to the run-mode status before the first balance arrives", () => {
    expect(deriveTrafficStatus(null, makeStatus("low", "good"))).toBe("Low");
  });

  it("prefers the balance status over a stale run-mode status", () => {
    const balance = makeBalance(makeStatus("good", "good"));
    expect(deriveTrafficStatus(balance, makeStatus("empty", "empty"))).toBe(
      "Sufficient",
    );
  });
});

describe("deriveNodeStatus", () => {
  it("maps the daemon's gas level to the UI status text", () => {
    expect(deriveNodeStatus(makeBalance(makeStatus("good", "low")), null))
      .toBe("Low");
    expect(deriveNodeStatus(makeBalance(makeStatus("good", "empty")), null))
      .toBe("Empty");
  });
});

describe("deriveOverallStatus", () => {
  it("returns the worst of traffic and gas", () => {
    expect(deriveOverallStatus(makeBalance(makeStatus("empty", "good")), null))
      .toBe("Empty");
    expect(deriveOverallStatus(makeBalance(makeStatus("good", "empty")), null))
      .toBe("Empty");
    expect(deriveOverallStatus(makeBalance(makeStatus("low", "good")), null))
      .toBe("Low");
    expect(deriveOverallStatus(makeBalance(makeStatus("good", "good")), null))
      .toBe("Sufficient");
  });
});

describe("deriveWxhoprDeficit / deriveXdaiDeficit", () => {
  it("passes through the daemon-computed deficits as-is", () => {
    const status = makeStatus("low", "low", {
      wxhoprDeficit: 500n,
      xdaiDeficit: 20n,
    });
    const balance = makeBalance(status);
    expect(deriveWxhoprDeficit(balance, null)).toBe(500n);
    expect(deriveXdaiDeficit(balance, null)).toBe(20n);
  });

  it("returns null without a status", () => {
    expect(deriveWxhoprDeficit(null, null)).toBeNull();
    expect(deriveXdaiDeficit(makeBalance(null), null)).toBeNull();
  });
});

describe("deriveRefillShortfall", () => {
  it("returns the shortfall while the ideal balance is covered", () => {
    const status = makeStatus("low", "good", { refillShortfall: 5n });
    expect(deriveRefillShortfall(makeBalance(status), null)).toBe(5n);
  });

  it("yields to the wxHOPR deficit when both are set", () => {
    const status = makeStatus("low", "good", {
      wxhoprDeficit: 7n,
      refillShortfall: 5n,
    });
    expect(deriveRefillShortfall(makeBalance(status), null)).toBeNull();
  });

  it("is null without a shortfall or any status", () => {
    expect(deriveRefillShortfall(makeBalance(makeStatus("good", "good")), null))
      .toBeNull();
    expect(deriveRefillShortfall(null, null)).toBeNull();
  });
});

describe("describeCriticalIssue", () => {
  it("returns null when both levels are Good", () => {
    expect(describeCriticalIssue(makeBalance(makeStatus("good", "good")), null))
      .toBeNull();
  });

  it("returns null without any status", () => {
    expect(describeCriticalIssue(null, null)).toBeNull();
  });

  it("describes traffic when it's the worse resource", () => {
    expect(describeCriticalIssue(makeBalance(makeStatus("low", "good")), null))
      .toBe("Traffic funds are low — top up wxHOPR");
    expect(describeCriticalIssue(makeBalance(makeStatus("empty", "low")), null))
      .toBe("Traffic funds are empty — top up wxHOPR");
  });

  it("describes gas when it's the worse resource", () => {
    expect(describeCriticalIssue(makeBalance(makeStatus("good", "low")), null))
      .toBe("Gas is low — top up xDAI");
    expect(describeCriticalIssue(makeBalance(makeStatus("low", "empty")), null))
      .toBe("Gas is empty — top up xDAI");
  });
});
