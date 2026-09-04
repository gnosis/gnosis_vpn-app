import { describe, expect, it } from "vitest";
import {
  formatConnectionStatus,
  getSlotLoad,
  getSlotLoadLevel,
} from "./exitHealth.ts";
import type { RouteHealthView } from "@src/services/vpnService.ts";

function readyWithSlots(available: number, connected: number): RouteHealthView {
  return {
    state: {
      state: "ReadyToConnect",
      exit: {
        checked_at: 0,
        versions: { versions: ["1"], latest: "1" },
        ping_rtt: 100,
        health: {
          slots: { available, connected },
          load_avg: { one: 0, five: 0, fifteen: 0, nproc: 1 },
        },
      },
    },
    last_error: null,
    checking_since: null,
    consecutive_failures: 0,
  };
}

describe("getSlotLoad", () => {
  it("returns the share of slots in use as a whole percentage", () => {
    expect(getSlotLoad(readyWithSlots(1, 1))).toEqual({
      used: 1,
      total: 2,
      percent: 50,
    });
    expect(getSlotLoad(readyWithSlots(10, 0))?.percent).toBe(0);
    expect(getSlotLoad(readyWithSlots(0, 10))?.percent).toBe(100);
  });

  it("rounds to the nearest whole percent", () => {
    expect(getSlotLoad(readyWithSlots(2, 1))?.percent).toBe(33);
    expect(getSlotLoad(readyWithSlots(1, 2))?.percent).toBe(67);
  });

  it("is null when the exit reports no slots at all", () => {
    expect(getSlotLoad(readyWithSlots(0, 0))).toBeNull();
  });

  it("is null when there is no exit health data", () => {
    const rhv: RouteHealthView = {
      state: { state: "Routable" },
      last_error: null,
      checking_since: null,
      consecutive_failures: 0,
    };
    expect(getSlotLoad(rhv)).toBeNull();
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
