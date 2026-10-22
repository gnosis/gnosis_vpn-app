import { describe, expect, it } from "vitest";
import type { RouteHealthView } from "@src/services/vpnService.ts";
import { type ExitData, NO_CONTEXT } from "./destinations.ts";
import { pickerGrade, pickerVerdict } from "./pickerVerdict.ts";
import {
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
  unrecoverableRouteHealth,
  weakRouteHealth,
} from "@src/testing/destinations.ts";

function measured(available: number, total = 4, rtt = 100): ExitData {
  return {
    slots: { total, available, connected: total - available },
    loadAvg: { one: 0, five: 0, fifteen: 0, nproc: 1 },
    rtt,
    checkedAt: 0,
    versions: { versions: ["v1"], latest: "v1" },
    apiVersion: "v1",
  };
}

const READY = eligibleRouteHealth(3);
const NO_WALK: RouteHealthView = { ...READY, walk: null };

describe("pickerVerdict", () => {
  it("names each measured band", () => {
    expect(pickerVerdict({ kind: "measured", bars: 4 }, READY, measured(4)))
      .toEqual({
        headline: "Fast and ready",
        context: "Low delay and plenty of room. A good pick.",
      });
    expect(pickerVerdict({ kind: "measured", bars: 3 }, READY, measured(4)))
      .toEqual({
        headline: "Ready",
        context: "Works well for everyday browsing.",
      });
    expect(pickerVerdict({ kind: "measured", bars: 2 }, READY, measured(4)))
      .toEqual({
        headline: "Ready, a bit slower",
        context: "Works fine; pages may take a moment longer.",
      });
    expect(pickerVerdict({ kind: "measured", bars: 1 }, READY, measured(4)))
      .toEqual({
        headline: "Ready, but slow",
        context: "Expect noticeable delay.",
      });
  });

  it("explains a weak route and a pending check", () => {
    expect(pickerVerdict({ kind: "weak" }, weakRouteHealth(), null)).toEqual({
      headline: "Weak route",
      context:
        "Connects, but the path through the network is unreliable right now.",
    });
    expect(pickerVerdict({ kind: "unmeasured" }, READY, null)).toEqual({
      headline: "Checking…",
      context: "Measuring this location. Takes a few seconds.",
    });
  });

  it("states the route health's own verdict for none", () => {
    const none = { kind: "none" } as const;
    expect(pickerVerdict(none, READY, measured(0))).toEqual({
      headline: "Full",
      context: "No free slots right now. Pick another location.",
    });
    expect(pickerVerdict(none, noPathRouteHealth(), null)).toEqual({
      headline: "No route",
      context: "Can't be reached right now. Pick another location.",
    });
    expect(pickerVerdict(none, unrecoverableRouteHealth("NotAllowed"), null))
      .toEqual({
        headline: "Connection not allowed",
        context: "Can't be reached right now. Pick another location.",
      });
    expect(
      pickerVerdict(
        none,
        unrecoverableRouteHealth({
          IncompatibleApiVersion: { server_versions: ["v2"] },
        }),
        null,
      ).headline,
    ).toBe("Incompatible server version");
    expect(
      pickerVerdict(
        none,
        unrecoverableRouteHealth({ CannotOpenSession: { error: "x" } }),
        null,
      ).headline,
    ).toBe("Cannot open session");
    expect(pickerVerdict(none, NO_WALK, null).headline).toBe("Checking…");
    expect(pickerVerdict(none, null, null).headline).toBe("Unavailable");
  });
});

describe("pickerGrade", () => {
  it("reads an unwalked destination as unmeasured, whatever routeGrade says", () => {
    const state = { destination: makeDestination(), route_health: NO_WALK };
    expect(pickerGrade(state, null, NO_CONTEXT)).toEqual({
      kind: "unmeasured",
    });
    const notRoutable = {
      destination: makeDestination(),
      route_health: { ...NO_WALK, state: { state: "NotRoutable" as const } },
    };
    expect(pickerGrade(notRoutable, null, NO_CONTEXT)).toEqual({
      kind: "unmeasured",
    });
  });

  it("otherwise defers to routeGrade", () => {
    const ready = { destination: makeDestination(), route_health: READY };
    expect(pickerGrade(ready, null, NO_CONTEXT)).toEqual({
      kind: "unmeasured",
    });
    const weak = {
      destination: makeDestination(),
      route_health: weakRouteHealth(),
    };
    expect(pickerGrade(weak, null, NO_CONTEXT)).toEqual({ kind: "weak" });
    const dead = {
      destination: makeDestination(),
      route_health: noPathRouteHealth(),
    };
    expect(pickerGrade(dead, null, NO_CONTEXT)).toEqual({ kind: "none" });
  });
});
