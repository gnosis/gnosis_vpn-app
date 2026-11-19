import { describe, expect, it } from "vitest";
import {
  formatExitHealthStatus,
  formatLatency,
  getLatencyLevel,
  getLatencyMs,
  getSlotLoad,
  getSlotLoadLevel,
} from "./exitHealth.ts";
import type { ExitData } from "./destinations.ts";
import {
  eligibleRouteHealth,
  gradedRouteHealth,
  noPathRouteHealth,
  unrecoverableRouteHealth,
} from "@src/testing/destinations.ts";

function measured(
  available: number,
  connected: number,
  total: number = available + connected,
  rtt = 100,
): ExitData {
  return {
    slots: { total, available, connected },
    loadAvg: { one: 0, five: 0, fifteen: 0, nproc: 1 },
    rtt,
    checkedAt: 0,
    versions: { api: ["v1"], server: null },
    apiVersion: "v1",
  };
}

describe("getSlotLoad", () => {
  it("returns the share of slots in use as a whole percentage", () => {
    expect(getSlotLoad(measured(1, 1))).toEqual({
      used: 1,
      total: 2,
      percent: 50,
    });
  });

  it("rounds to the nearest whole percent", () => {
    expect(getSlotLoad(measured(2, 1))?.percent).toBe(33);
  });

  it("takes the total from the server, so pending registrations do not shrink it", () => {
    expect(getSlotLoad(measured(1, 1, 4))).toEqual({
      used: 1,
      total: 4,
      percent: 25,
    });
  });

  it("is null when the exit reports no slots at all", () => {
    expect(getSlotLoad(measured(0, 0, 0))).toBe(null);
  });

  it("is null when there is no exit data", () => {
    expect(getSlotLoad(null)).toBe(null);
  });
});

describe("getSlotLoadLevel", () => {
  it("is low up to and including 50%", () => {
    expect(getSlotLoadLevel(0)).toBe("low");
    expect(getSlotLoadLevel(50)).toBe("low");
  });

  it("is medium above 50% up to and including 75%", () => {
    expect(getSlotLoadLevel(51)).toBe("medium");
    expect(getSlotLoadLevel(75)).toBe("medium");
  });

  it("is high above 75%", () => {
    expect(getSlotLoadLevel(76)).toBe("high");
    expect(getSlotLoadLevel(100)).toBe("high");
  });
});

describe("getLatencyMs — one-way, as displayed", () => {
  it("prefers the tunnel rtt once the tunnel has a sample", () => {
    expect(getLatencyMs(measured(1, 1, 2, 300), 100)).toBe(50);
  });

  it("falls back to the exit rtt when the tunnel has no sample", () => {
    expect(getLatencyMs(measured(1, 1, 2, 300), null)).toBe(150);
  });

  it("still shows the tunnel rtt when nothing measured the exit", () => {
    expect(getLatencyMs(null, 100)).toBe(50);
  });

  it("is null without either", () => {
    expect(getLatencyMs(null, null)).toBe(null);
  });
});

describe("formatLatency", () => {
  it("shows ms up to 9,999", () => {
    expect(formatLatency(42)).toBe("42 ms");
    expect(formatLatency(9999)).toBe("9,999 ms");
  });

  it("switches to seconds past 9,999 ms, to one decimal", () => {
    expect(formatLatency(10000)).toBe("10 s");
    expect(formatLatency(12345)).toBe("12.3 s");
    expect(formatLatency(99_949)).toBe("99.9 s");
  });

  it("drops the decimal from 100 s, so it stays no wider than 9,999 ms", () => {
    expect(formatLatency(123_456)).toBe("123 s");
    expect(formatLatency(1_234_567)).toBe("1,235 s");
  });
});

describe("getLatencyLevel", () => {
  it("is low below 500 ms", () => {
    expect(getLatencyLevel(0)).toBe("low");
    expect(getLatencyLevel(499)).toBe("low");
  });

  it("is medium from 500 ms up to and including 1100 ms", () => {
    expect(getLatencyLevel(500)).toBe("medium");
    expect(getLatencyLevel(1100)).toBe("medium");
  });

  it("is high above 1100 ms", () => {
    expect(getLatencyLevel(1101)).toBe("high");
  });
});

describe("formatExitHealthStatus — one label per route state", () => {
  it("names any graded route ready, whatever its percent of best", () => {
    expect(formatExitHealthStatus(eligibleRouteHealth(), null)).toBe(
      "Ready to connect",
    );
    expect(formatExitHealthStatus(gradedRouteHealth(10), null)).toBe(
      "Ready to connect",
    );
  });

  it("calls a measured exit with no free slot full", () => {
    expect(formatExitHealthStatus(eligibleRouteHealth(), measured(0, 4))).toBe(
      "Full",
    );
  });

  it("names the missing route and the unrecoverable reason", () => {
    expect(formatExitHealthStatus(noPathRouteHealth(), null)).toBe("No route");
    expect(formatExitHealthStatus(unrecoverableRouteHealth(), null)).toBe(
      "Connection not allowed",
    );
    const cannotOpen = {
      ...unrecoverableRouteHealth(),
      state: {
        type: "unrecoverable" as const,
        reason: {
          type: "cannot_open_session" as const,
          error: "surb buffer too small",
        },
      },
    };
    expect(formatExitHealthStatus(cannotOpen, null)).toBe(
      "Cannot open session",
    );
  });

  it("is still checking before the first walk", () => {
    expect(
      formatExitHealthStatus({ ...noPathRouteHealth(), walked_at: null }, null),
    ).toBe("Checking…");
    expect(
      formatExitHealthStatus(
        { ...eligibleRouteHealth(), walked_at: null },
        null,
      ),
    ).toBe("Checking…");
  });

  it("says no route only once a walk came back empty", () => {
    expect(formatExitHealthStatus(noPathRouteHealth(), null)).toBe("No route");
  });
});
