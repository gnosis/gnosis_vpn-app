import { describe, expect, it } from "vitest";
import {
  formatConnectionStatus,
  formatExitHealthStatus,
  getConnectionQuality,
  getExitHealthColor,
  getLatencyLevel,
  getLatencyMs,
  getSlotLoad,
  getSlotLoadLevel,
} from "./exitHealth.ts";
import type { ExitData } from "./destinations.ts";
import {
  eligibleRouteHealth,
  noPathRouteHealth,
  unrecoverableRouteHealth,
  weakRouteHealth,
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
    versions: { versions: ["v1"], latest: "v1" },
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
  it("names a path within the band ready and one below it weak", () => {
    expect(formatExitHealthStatus(eligibleRouteHealth(), null)).toBe(
      "Ready to connect",
    );
    expect(formatExitHealthStatus(weakRouteHealth(0.999), null)).toBe(
      "Ready to connect",
    );
    expect(formatExitHealthStatus(weakRouteHealth(0.9), null)).toBe(
      "Ready to connect",
    );
    expect(formatExitHealthStatus(weakRouteHealth(0.89), null)).toBe(
      "Weak route",
    );
    expect(formatExitHealthStatus(weakRouteHealth(), null)).toBe("Weak route");
  });

  it("colors the band edge the same way as the label", () => {
    expect(getExitHealthColor(weakRouteHealth(0.9), null)).toBe("green");
    expect(getExitHealthColor(weakRouteHealth(0.89), null)).toBe("yellow");
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
        state: "Unrecoverable" as const,
        reason: { CannotOpenSession: { error: "surb buffer too small" } },
      },
    };
    expect(formatExitHealthStatus(cannotOpen, null)).toBe(
      "Cannot open session",
    );
  });

  it("is still checking before the first walk", () => {
    expect(
      formatExitHealthStatus({ ...eligibleRouteHealth(), walk: null }, null),
    ).toBe("Checking…");
  });
});

describe("getConnectionQuality", () => {
  const STALL = { since: 0, failed_pings: 1, reconnect_at: 3 };

  it("is good when latency and load are both low", () => {
    expect(getConnectionQuality(100, "low", null)).toBe("good");
    expect(getConnectionQuality(499, "low", undefined)).toBe("good");
  });

  it("is fair when either latency or load is medium", () => {
    expect(getConnectionQuality(500, "low", null)).toBe("fair");
    expect(getConnectionQuality(1100, "low", null)).toBe("fair");
    expect(getConnectionQuality(100, "medium", null)).toBe("fair");
  });

  it("is poor when either latency or load is high", () => {
    expect(getConnectionQuality(1101, "low", null)).toBe("poor");
    expect(getConnectionQuality(100, "high", null)).toBe("poor");
  });

  it("is poor while the tunnel stalls, whatever the numbers say", () => {
    expect(getConnectionQuality(100, "low", STALL)).toBe("poor");
  });

  it("counts unknown latency as medium until the first sample", () => {
    expect(getConnectionQuality(null, "low", null)).toBe("fair");
    expect(getConnectionQuality(null, "high", null)).toBe("poor");
  });

  it("holds unknown load against nothing", () => {
    expect(getConnectionQuality(100, null, null)).toBe("good");
    expect(getConnectionQuality(1200, null, null)).toBe("poor");
  });
});

describe("formatConnectionStatus", () => {
  it("shows Connected only while connected", () => {
    expect(formatConnectionStatus("Connected")).toBe("Connected");
  });

  it("folds reconnecting into Connecting", () => {
    expect(formatConnectionStatus("Connecting")).toBe("Connecting");
    expect(formatConnectionStatus("Reconnecting")).toBe("Connecting");
  });

  it("treats disconnecting as already disconnected", () => {
    expect(formatConnectionStatus("Disconnecting")).toBe("Disconnected");
    expect(formatConnectionStatus("None")).toBe("Disconnected");
  });
});
