import { describe, expect, it } from "vitest";
import {
  deriveNodeStatus,
  deriveOverallStatus,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  deriveXdaiDeficit,
  preparingSafeShortfall,
  roundUpToStep,
  WXHOPR_SEND_STEP,
} from "./funding.ts";
import type {
  BalanceResponse,
  FundingStatus,
  PreparingSafe,
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

describe("preparingSafeShortfall", () => {
  const preparing = (
    have: { wxhopr: bigint; xdai: bigint },
    recommended: { wxhopr: bigint; xdai: bigint } | null,
  ): PreparingSafe => ({
    type: "preparing_safe",
    node_address: "0xnode",
    node_wxhopr: have.wxhopr,
    node_xdai: have.xdai,
    funding_tool: null,
    error: null,
    balance_recommendation: recommended && {
      ...recommended,
      channel_stakes: 0n,
      fee_to_start: 0n,
      txs_to_start: 0,
      xdai_fee_per_tx: 0n,
      topup_headroom: 0n,
    },
  });

  it("is what is still missing per token", () => {
    const rm = preparing({ wxhopr: 30n, xdai: 0n }, {
      wxhopr: 100n,
      xdai: 50n,
    });
    expect(preparingSafeShortfall(rm, "wxhopr")).toBe(70n);
    expect(preparingSafeShortfall(rm, "xdai")).toBe(50n);
  });

  it("is null once the recommendation is met or exceeded", () => {
    const rm = preparing({ wxhopr: 100n, xdai: 51n }, {
      wxhopr: 100n,
      xdai: 50n,
    });
    expect(preparingSafeShortfall(rm, "wxhopr")).toBeNull();
    expect(preparingSafeShortfall(rm, "xdai")).toBeNull();
  });

  it("is null without a recommendation or outside preparing_safe", () => {
    const rm = preparing({ wxhopr: 0n, xdai: 0n }, null);
    expect(preparingSafeShortfall(rm, "wxhopr")).toBeNull();
    expect(preparingSafeShortfall(null, "xdai")).toBeNull();
  });
});

describe("roundUpToStep", () => {
  const WXHOPR = 10n ** 18n;

  it("rounds up to the next 10 wxHOPR", () => {
    expect(roundUpToStep(431n * WXHOPR + 13n, WXHOPR_SEND_STEP)).toBe(
      440n * WXHOPR,
    );
    expect(roundUpToStep(481n * WXHOPR + 13n, WXHOPR_SEND_STEP)).toBe(
      490n * WXHOPR,
    );
    expect(roundUpToStep(1n, WXHOPR_SEND_STEP)).toBe(10n * WXHOPR);
  });

  it("keeps exact multiples", () => {
    expect(roundUpToStep(100n * WXHOPR, WXHOPR_SEND_STEP)).toBe(100n * WXHOPR);
  });
});
