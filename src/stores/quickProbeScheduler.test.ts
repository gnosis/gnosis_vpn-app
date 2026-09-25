import { describe, expect, it } from "vitest";
import type {
  DestinationState,
  QuickProbeState,
} from "@src/services/vpnService.ts";
import type { ModeAppState } from "./destinationMode.ts";
import {
  IDLE_SCHEDULE,
  nextQuickProbe,
  QUICK_PROBE_FRESH_MS,
  QUICK_PROBE_TIMEOUT_MS,
  quickProbeAnswered,
} from "./quickProbeScheduler.ts";
import {
  checkedQuickProbe,
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
} from "@src/testing/destinations.ts";

const SLOTS = { total: 8, available: 6, connected: 2 };

function dest(
  id: string,
  relays: number,
  quick_probe: QuickProbeState | null = null,
): DestinationState {
  return {
    destination: makeDestination({ id }),
    route_health: { ...eligibleRouteHealth(relays), quick_probe },
  };
}

function noRoute(id: string): DestinationState {
  return {
    destination: makeDestination({ id }),
    route_health: noPathRouteHealth(),
  };
}

function statusFor(
  destinations: Record<string, DestinationState>,
): ModeAppState {
  return {
    availableDestinations: Object.values(destinations).map((d) =>
      d.destination
    ),
    destinations,
    connected: null,
    connecting: null,
    reconnecting: null,
    probe: null,
  };
}

describe("nextQuickProbe — which exit to check next", () => {
  it("starts with the best ranked destination that is not the active one", () => {
    const status = statusFor({
      best: dest("best", 4),
      good: dest("good", 3),
      ok: dest("ok", 1),
    });

    const { issue, schedule } = nextQuickProbe(
      IDLE_SCHEDULE,
      status,
      "best",
      0,
    );

    expect(issue).toBe("good");
    expect(schedule.inFlight).toEqual({ id: "good", issuedAt: 0 });
  });

  it("skips destinations the daemon would refuse: no route, or a check already running", () => {
    const status = statusFor({
      best: dest("best", 4, { state: "Checking", since: 0 }),
      nowhere: noRoute("nowhere"),
      ok: dest("ok", 1),
    });

    expect(nextQuickProbe(IDLE_SCHEDULE, status, null, 0).issue).toBe("ok");
  });

  it("skips a result younger than the freshness guard and redoes an older one", () => {
    const fresh = dest("fresh", 4, checkedQuickProbe(SLOTS, 100, 1_000));
    const stale = dest("stale", 3, checkedQuickProbe(SLOTS, 100, 0));
    const now = 1_000 + QUICK_PROBE_FRESH_MS - 1;

    expect(
      nextQuickProbe(IDLE_SCHEDULE, statusFor({ fresh, stale }), null, now)
        .issue,
    ).toBe("stale");
    expect(
      nextQuickProbe(IDLE_SCHEDULE, statusFor({ fresh }), null, now).issue,
    ).toBe(null);
    expect(
      nextQuickProbe(IDLE_SCHEDULE, statusFor({ fresh }), null, now + 1).issue,
    ).toBe("fresh");
  });

  it("waits while the check in flight has no result yet", () => {
    const inFlight = { inFlight: { id: "a", issuedAt: 100 } };
    const status = statusFor({
      a: dest("a", 2, { state: "Checking", since: 100 }),
      b: dest("b", 1),
    });

    const next = nextQuickProbe(inFlight, status, null, 200);

    expect(next.issue).toBe(null);
    expect(next.schedule).toEqual(inFlight);
  });

  it("moves on once the result lands, but not on a result older than the request", () => {
    const inFlight = { inFlight: { id: "a", issuedAt: 100 } };
    const older = statusFor({
      a: dest("a", 2, checkedQuickProbe(SLOTS, 100, 50)),
      b: dest("b", 1),
    });
    const landed = statusFor({
      a: dest("a", 2, checkedQuickProbe(SLOTS, 100, 150)),
      b: dest("b", 1),
    });

    expect(nextQuickProbe(inFlight, older, null, 200).issue).toBe(null);
    expect(nextQuickProbe(inFlight, landed, null, 200).issue).toBe("b");
  });

  it("treats a failed check as a result too", () => {
    const inFlight = { inFlight: { id: "a", issuedAt: 100 } };
    const status = statusFor({
      a: dest("a", 2, { state: "Failed", checked_at: 150, error: "timeout" }),
      b: dest("b", 1),
    });

    expect(nextQuickProbe(inFlight, status, null, 200).issue).toBe("b");
  });

  it("abandons a check by the clock when its result never arrives", () => {
    const inFlight = { inFlight: { id: "a", issuedAt: 100 } };
    const status = statusFor({
      a: dest("a", 2, { state: "Checking", since: 100 }),
      b: dest("b", 1),
    });

    expect(
      nextQuickProbe(inFlight, status, null, 100 + QUICK_PROBE_TIMEOUT_MS - 1)
        .issue,
    ).toBe(null);
    expect(
      nextQuickProbe(inFlight, status, null, 100 + QUICK_PROBE_TIMEOUT_MS)
        .issue,
    ).toBe("b");
  });

  it("issues nothing when every candidate is fresh, and idles the schedule", () => {
    const status = statusFor({
      a: dest("a", 2, checkedQuickProbe(SLOTS, 100, 0)),
    });

    const next = nextQuickProbe(IDLE_SCHEDULE, status, null, 1);

    expect(next.issue).toBe(null);
    expect(next.schedule).toEqual(IDLE_SCHEDULE);
  });
});

describe("quickProbeAnswered — the daemon's immediate reply", () => {
  it("keeps the schedule when the check was accepted", () => {
    const schedule = { inFlight: { id: "a", issuedAt: 0 } };

    expect(quickProbeAnswered(schedule, "a", true)).toEqual(schedule);
  });

  it("clears the flight when the daemon refused, so the next poll moves on", () => {
    const schedule = { inFlight: { id: "a", issuedAt: 0 } };

    expect(quickProbeAnswered(schedule, "a", false)).toEqual(IDLE_SCHEDULE);
  });

  it("ignores a reply for a check that is no longer the one in flight", () => {
    const schedule = { inFlight: { id: "b", issuedAt: 5 } };

    expect(quickProbeAnswered(schedule, "a", false)).toEqual(schedule);
  });
});
