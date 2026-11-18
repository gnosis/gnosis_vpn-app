import { describe, expect, it } from "vitest";
import {
  DATA_SEND_STEP,
  dataToSend,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  formatDataToSend,
  preparingSafeShortfall,
  roundUpToStep,
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

describe("deriveWxhoprDeficit", () => {
  it("passes through the daemon-computed deficit as-is", () => {
    const status = makeStatus("low", "low", { wxhoprDeficit: 500n });
    expect(deriveWxhoprDeficit(makeBalance(status), null)).toBe(500n);
  });

  it("returns null without a status", () => {
    expect(deriveWxhoprDeficit(null, null)).toBeNull();
    expect(deriveWxhoprDeficit(makeBalance(null), null)).toBeNull();
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
    issue: null,
    balance_recommendation: recommended && {
      ...recommended,
      channel_stakes: 0n,
      pix_pool: 0n,
      fee_to_start: 0n,
      txs_to_start: 0,
      xdai_fee_per_tx: 0n,
      topup_headroom: 0n,
    },
  });

  it("is the wxHOPR still missing", () => {
    const rm = preparing({ wxhopr: 30n, xdai: 0n }, {
      wxhopr: 100n,
      xdai: 50n,
    });
    expect(preparingSafeShortfall(rm)).toBe(70n);
  });

  it("is null once the recommendation is met or exceeded", () => {
    const met = preparing({ wxhopr: 100n, xdai: 0n }, {
      wxhopr: 100n,
      xdai: 50n,
    });
    const exceeded = preparing({ wxhopr: 101n, xdai: 0n }, {
      wxhopr: 100n,
      xdai: 50n,
    });
    expect(preparingSafeShortfall(met)).toBeNull();
    expect(preparingSafeShortfall(exceeded)).toBeNull();
  });

  it("is null without a recommendation or outside preparing_safe", () => {
    const rm = preparing({ wxhopr: 0n, xdai: 0n }, null);
    expect(preparingSafeShortfall(rm)).toBeNull();
    expect(preparingSafeShortfall(null)).toBeNull();
  });
});

describe("roundUpToStep", () => {
  it("rounds up to the next step", () => {
    expect(roundUpToStep(431n, 10n)).toBe(440n);
    expect(roundUpToStep(1n, 10n)).toBe(10n);
  });

  it("keeps exact multiples", () => {
    expect(roundUpToStep(100n, 10n)).toBe(100n);
  });
});

describe("dataToSend", () => {
  const GB = 1024n ** 3n;

  it("rounds the data the wxHOPR buys up to whole 5 GB", () => {
    expect(dataToSend(1n, 1n)).toBe(DATA_SEND_STEP);
    expect(dataToSend(5n * GB, 1n)).toBe(5n * GB);
    expect(dataToSend(5n * GB + 1n, 1n)).toBe(10n * GB);
  });

  it("counts a partly bought byte as a whole one", () => {
    expect(dataToSend(5n * GB * 9n + 1n, 9n)).toBe(10n * GB);
  });

  it("rounds to a given step instead", () => {
    expect(dataToSend(22n * GB + 1n, 1n, GB)).toBe(23n * GB);
    expect(dataToSend(22n * GB, 1n, GB)).toBe(22n * GB);
  });

  it("has no answer without a PIX price", () => {
    expect(dataToSend(10n ** 18n, 0n)).toBeNull();
  });

  it("reads as whole GB", () => {
    expect(formatDataToSend(15n * GB)).toBe("15 GB");
  });
});
