import { describe, expect, it } from "vitest";
import {
  balanceWarning,
  dataToSend,
  deriveTrafficStatus,
  formatDataToSend,
  roundUpToStep,
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

  it("rounds the data the wxHOPR buys up to whole GB", () => {
    expect(dataToSend(1n, 1n)).toBe(GB);
    expect(dataToSend(22n * GB, 1n)).toBe(22n * GB);
    expect(dataToSend(22n * GB + 1n, 1n)).toBe(23n * GB);
  });

  it("counts a partly bought byte as a whole one", () => {
    expect(dataToSend(GB * 9n + 1n, 9n)).toBe(2n * GB);
  });

  it("has no answer without a PIX price", () => {
    expect(dataToSend(10n ** 18n, 0n)).toBeNull();
  });

  it("reads as whole GB", () => {
    expect(formatDataToSend(15n * GB)).toBe("15 GB");
  });
});

describe("balanceWarning", () => {
  const GB = 1024n ** 3n;

  it("has nothing to say while traffic is good", () => {
    expect(balanceWarning(makeBalance(makeStatus("good", "low")), null, 1n))
      .toBeNull();
  });

  it("asks for the client's deficit as data at the PIX price", () => {
    const status = makeStatus("empty", "good", { wxhoprDeficit: 4n * GB });
    expect(balanceWarning(makeBalance(status), null, 2n)).toEqual({
      status: "Empty",
      text: "Balance empty, add at least 2 GB of data to stay connected",
    });
  });

  it("rounds a Low deficit up to whole GB", () => {
    const status = makeStatus("low", "good", { wxhoprDeficit: GB + 1n });
    expect(balanceWarning(makeBalance(status), null, 1n)?.text).toBe(
      "Balance low, add at least 2 GB of data to stay connected",
    );
  });

  it("asks for data without an amount when there is no PIX price", () => {
    const status = makeStatus("low", "good", { wxhoprDeficit: GB });
    expect(balanceWarning(makeBalance(status), null, 0n)?.text).toBe(
      "Balance low, add data to stay connected",
    );
  });

  it("warns from the run-mode status before the first balance arrives", () => {
    expect(balanceWarning(null, makeStatus("low", "good"), 1n)).toEqual({
      status: "Low",
      text: "Balance low, add data to stay connected",
    });
  });
});
