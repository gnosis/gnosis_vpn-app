import { describe, expect, it } from "vitest";
import {
  computeEffectiveCredit,
  dataLeftFraction,
  exitsCovered,
  formatCountCompact,
  formatCreditCompact,
  formatDataLeft,
  sumCapacityStake,
} from "./credit.ts";
import type {
  BalanceResponse,
  Capacity,
  CapacityAllocations,
  PixChunkStats,
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

describe("sumCapacityStake", () => {
  it("returns 0 when allocations are missing", () => {
    expect(sumCapacityStake(makeBalance(null))).toBe(0n);
  });

  it("sums stake across node, safe and peer allocations", () => {
    const allocations = makeAllocations({
      node: makeCapacity(0, 1n),
      safe: makeCapacity(0, 20n),
      peer_allocations: {
        "0xabc": makeCapacity(0, 300n),
        "0xdef": makeCapacity(0, 4000n),
      },
    });
    expect(sumCapacityStake(makeBalance(allocations))).toBe(4321n);
  });
});

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

describe("formatCountCompact", () => {
  it("shows counts below 1000 as they are", () => {
    expect(formatCountCompact(0n)).toBe("0");
    expect(formatCountCompact(7n)).toBe("7");
    expect(formatCountCompact(999n)).toBe("999");
  });

  it("adds one decimal below 100 of a unit, never more", () => {
    expect(formatCountCompact(1000n)).toBe("1.0k");
    expect(formatCountCompact(1234n)).toBe("1.2k");
    expect(formatCountCompact(99_949n)).toBe("99.9k");
    expect(formatCountCompact(4_850_000n)).toBe("4.9M");
  });

  it("keeps whole numbers from 100 up to 999 of a unit", () => {
    expect(formatCountCompact(100_000n)).toBe("100k");
    expect(formatCountCompact(999_499n)).toBe("999k");
    expect(formatCountCompact(999_000_000_000n)).toBe("999B");
  });

  it("rounds up into the next unit instead of growing a digit", () => {
    expect(formatCountCompact(99_950n)).toBe("100k");
    expect(formatCountCompact(999_500n)).toBe("1.0M");
    expect(formatCountCompact(999_500_000n)).toBe("1.0B");
  });

  it("keeps three digits for the largest counts", () => {
    expect(
      formatCountCompact(exitsCovered(2n ** 64n - 1n, BYTES_PER_MB * 600n)),
    ).toBe("29.3B");
    expect(formatCountCompact(999n * 10n ** 12n)).toBe("999T");
    expect(formatCountCompact(10n ** 15n)).toBe("999+T");
  });
});

describe("exitsCovered", () => {
  const chunk = BYTES_PER_MB * 600n;

  it("counts whole chunks, rounding down", () => {
    expect(exitsCovered(BYTES_PER_MB * 4800n, chunk)).toBe(8n);
    expect(exitsCovered(BYTES_PER_MB * 1199n, chunk)).toBe(1n);
    expect(exitsCovered(BYTES_PER_MB * 599n, chunk)).toBe(0n);
    expect(exitsCovered(0n, chunk)).toBe(0n);
  });

  it("covers nothing with a zero chunk size", () => {
    expect(exitsCovered(BYTES_PER_MB * 4800n, 0n)).toBe(0n);
  });
});

const FUNDED: PixChunkStats = {
  phase: "funded",
  chunks_committed: 2,
  chunks_paid: 2,
  chunks_failed: 0,
  chunk_bytes: 600 * 1_048_576,
  bytes_bought: 1200 * 1_048_576,
  cost: 0n,
  bytes_spent: 300 * 1_048_576,
  bytes_left: 900 * 1_048_576,
  bytes_received: null,
  empty_in: null,
};

const FREE: PixChunkStats = {
  ...FUNDED,
  phase: "free",
  chunks_committed: 0,
  chunks_paid: 0,
  chunk_bytes: 0,
  bytes_bought: 0,
  bytes_spent: null,
  bytes_left: null,
};

describe("formatDataLeft", () => {
  it("shows the bytes left of the chunks bought", () => {
    expect(formatDataLeft(FUNDED)).toBe("900 MB");
  });

  it("reads Free before the exit asks for a chunk", () => {
    expect(formatDataLeft(FREE)).toBe("Free");
  });

  it("shows a dash while usage is unmeasured", () => {
    expect(formatDataLeft({ ...FUNDED, bytes_left: null })).toBe("—");
  });
});

describe("dataLeftFraction", () => {
  it("is the unspent share of the chunks bought", () => {
    expect(dataLeftFraction(FUNDED)).toBe(0.75);
  });

  it("is full before anything is bought or measured", () => {
    expect(dataLeftFraction(FREE)).toBe(1);
    expect(dataLeftFraction({ ...FUNDED, bytes_left: null })).toBe(1);
  });

  it("never exceeds full", () => {
    expect(dataLeftFraction({ ...FUNDED, bytes_left: FUNDED.bytes_bought * 2 }))
      .toBe(1);
  });
});
