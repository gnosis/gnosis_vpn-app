import { describe, expect, it } from "vitest";
import type {
  Destination,
  DestinationState,
  RouteHealthView,
  Slots,
} from "@src/services/vpnService.ts";
import {
  destinationLabel,
  destinationSearchText,
  freeSlots,
  getExitData,
  isConfigOnly,
  isReady,
  isReadyForDisplay,
  isSelectable,
  isVpnActive,
  isWeakRoute,
  NO_CONTEXT,
  pickerRows,
  pickStartupTarget,
  type RankContext,
  routeGrade,
  routeGradeLabel,
  sortAlphaDestinations,
  sortByRouteQuality,
  trackWeakRoutes,
  WEAK_GRACE_MS,
  type WeakRoute,
} from "./destinations.ts";
import {
  checkedQuickProbe,
  checkingQuickProbe,
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
  probeViewFor,
  quickProbeCheck,
  unrecoverableRouteHealth,
  weakRouteHealth,
} from "@src/testing/destinations.ts";

/** Named as the backend names an exit it located in Germany. */
function germanExit(id: string): Destination {
  return makeDestination({
    id,
    address: "0x1234",
    geo: { country: "de", source: { type: "announced_ip" } },
    names: { display_name: "Germany", country: "Germany" },
  });
}

function withRouteHealth(
  id: string,
  route_health: RouteHealthView | null,
): DestinationState {
  return { destination: germanExit(id), route_health };
}

/** Eligible; `relays` is distinct first relays, so a higher number ranks higher. */
function makeEligible(
  id: string,
  relays = 2,
  count = relays,
): DestinationState {
  return withRouteHealth(id, eligibleRouteHealth(relays, count));
}

function makeWeak(id: string, bestValue = 0.5): DestinationState {
  return withRouteHealth(id, weakRouteHealth(bestValue));
}

const OPEN_SLOTS: Slots = { total: 8, available: 6, connected: 2 };
const FULL_SLOTS: Slots = { total: 4, available: 0, connected: 4 };

/** Eligible by the walk and measured by a quick probe. */
function makeMeasured(
  id: string,
  slots: Slots = OPEN_SLOTS,
  rtt = 100,
  relays = 2,
): DestinationState {
  return withRouteHealth(id, {
    ...eligibleRouteHealth(relays),
    quick_probe: checkedQuickProbe(slots, rtt),
  });
}

/** Eligible, being re-checked right now; `last` is what the previous check left behind. */
function makeRechecking(
  id: string,
  slots: Slots = OPEN_SLOTS,
  rtt = 100,
  carried = true,
): DestinationState {
  const last = carried ? quickProbeCheck(slots, rtt) : null;
  return withRouteHealth(id, {
    ...eligibleRouteHealth(),
    quick_probe: checkingQuickProbe(last),
  });
}

function liveOn(liveId: string | null): RankContext {
  return { probe: null, liveId };
}

function makeUnavailable(id: string): DestinationState {
  return withRouteHealth(id, null);
}

describe("isReady — connectable right now", () => {
  it("accepts a routable destination whose best path is within the band", () => {
    expect(isReady(makeEligible("a"), NO_CONTEXT)).toBe(true);
    expect(isReady(makeWeak("a", 0.999), NO_CONTEXT)).toBe(true);
    expect(isReady(makeWeak("a", 0.9), NO_CONTEXT)).toBe(true);
  });

  it("rejects a routable destination whose best path is below the band", () => {
    expect(isReady(makeWeak("a"), NO_CONTEXT)).toBe(false);
    expect(isReady(makeWeak("a", 0.89), NO_CONTEXT)).toBe(false);
  });

  it("rejects a destination the walk found no path to", () => {
    expect(isReady(withRouteHealth("a", noPathRouteHealth()), NO_CONTEXT)).toBe(
      false,
    );
  });

  it("rejects an unrecoverable destination even if it carries a walk", () => {
    const latched = {
      ...unrecoverableRouteHealth(),
      walk: eligibleRouteHealth().walk,
    };
    expect(isReady(withRouteHealth("a", latched), NO_CONTEXT)).toBe(false);
  });

  it("rejects a destination with no health at all", () => {
    expect(isReady(makeUnavailable("a"), NO_CONTEXT)).toBe(false);
    expect(isReady(undefined, NO_CONTEXT)).toBe(false);
  });
});

describe("isReadyForDisplay — what the list may present as usable", () => {
  it("passes the live destination through whatever its health says", () => {
    const dead = makeUnavailable("a");

    expect(isReadyForDisplay(dead, liveOn("a")), "we are connected to it").toBe(
      true,
    );
    expect(isReadyForDisplay(dead, NO_CONTEXT)).toBe(false);
  });

  it("otherwise agrees with isReady", () => {
    const ready = makeEligible("a");
    const weak = makeWeak("b");

    expect(isReadyForDisplay(ready, liveOn("c"))).toBe(
      isReady(ready, liveOn("c")),
    );
    expect(isReadyForDisplay(weak, liveOn("c"))).toBe(
      isReady(weak, liveOn("c")),
    );
  });
});

describe("isSelectable — what the user may pick", () => {
  it("accepts a degraded path: the daemon connects over any Routable route", () => {
    expect(isSelectable(makeWeak("a"), NO_CONTEXT)).toBe(true);
    expect(isSelectable(makeWeak("a", 0.89), NO_CONTEXT)).toBe(true);
    expect(isSelectable(makeWeak("a", 0.9), NO_CONTEXT)).toBe(true);
  });

  it("accepts everything ready", () => {
    expect(isSelectable(makeEligible("a"), NO_CONTEXT)).toBe(true);
    expect(isSelectable(makeMeasured("a"), NO_CONTEXT)).toBe(true);
  });

  it("rejects a full exit unless we hold its last slot", () => {
    expect(isSelectable(makeMeasured("a", FULL_SLOTS), NO_CONTEXT)).toBe(false);
    expect(isSelectable(makeMeasured("a", FULL_SLOTS), liveOn("a"))).toBe(true);
  });

  it("rejects what the daemon would not connect to", () => {
    expect(isSelectable(withRouteHealth("a", noPathRouteHealth()), NO_CONTEXT))
      .toBe(false);
    expect(
      isSelectable(
        withRouteHealth("a", unrecoverableRouteHealth()),
        NO_CONTEXT,
      ),
    ).toBe(false);
    expect(isSelectable(makeUnavailable("a"), NO_CONTEXT)).toBe(false);
    expect(isSelectable(undefined, NO_CONTEXT)).toBe(false);
  });
});

describe("isWeakRoute — selectable but not ready", () => {
  it("marks only the degraded-but-routable case", () => {
    expect(isWeakRoute(makeWeak("a"), NO_CONTEXT)).toBe(true);
    expect(isWeakRoute(makeWeak("a", 0.89), NO_CONTEXT)).toBe(true);
    expect(isWeakRoute(makeWeak("a", 0.9), NO_CONTEXT)).toBe(false);
    expect(isWeakRoute(makeEligible("a"), NO_CONTEXT)).toBe(false);
    expect(isWeakRoute(withRouteHealth("a", noPathRouteHealth()), NO_CONTEXT))
      .toBe(false);
    expect(isWeakRoute(undefined, NO_CONTEXT)).toBe(false);
  });

  it("is not weak when full: nothing to pick there", () => {
    const fullWeak = withRouteHealth("a", {
      ...weakRouteHealth(),
      quick_probe: checkedQuickProbe(FULL_SLOTS, 10),
    });
    expect(isWeakRoute(fullWeak, NO_CONTEXT)).toBe(false);
  });
});

describe("routeGrade — the score as shown, never as used", () => {
  it("grades nothing that is not selectable", () => {
    expect(routeGrade(undefined, NO_CONTEXT)).toEqual({ kind: "none" });
    expect(routeGrade(makeUnavailable("a"), NO_CONTEXT)).toEqual({
      kind: "none",
    });
    expect(routeGrade(withRouteHealth("a", noPathRouteHealth()), NO_CONTEXT))
      .toEqual({ kind: "none" });
    expect(routeGrade(makeMeasured("a", FULL_SLOTS), NO_CONTEXT)).toEqual({
      kind: "none",
    });
  });

  it("marks a degraded path weak regardless of what the exit measured", () => {
    expect(routeGrade(makeWeak("a"), NO_CONTEXT)).toEqual({ kind: "weak" });
    expect(routeGrade(makeWeak("a", 0.89), NO_CONTEXT)).toEqual({
      kind: "weak",
    });
    expect(routeGrade(makeWeak("a", 0.9), NO_CONTEXT)).toEqual({
      kind: "unmeasured",
    });
    const measuredWeak = withRouteHealth("a", {
      ...weakRouteHealth(),
      quick_probe: checkedQuickProbe(OPEN_SLOTS, 10),
    });
    expect(routeGrade(measuredWeak, NO_CONTEXT)).toEqual({ kind: "weak" });
  });

  it("holds an unmeasured ready exit at unmeasured until a probe answers", () => {
    expect(routeGrade(makeEligible("a"), NO_CONTEXT)).toEqual({
      kind: "unmeasured",
    });
  });

  it("fills bars by score band: latency half, capacity a third, relays a fifth", () => {
    // OPEN_SLOTS free 6/8 = 0.225, two relays = 0.1; latency decides the band
    const bars = (rtt: number) =>
      routeGrade(makeMeasured("a", OPEN_SLOTS, rtt), NO_CONTEXT);
    expect(bars(0), "0.825").toEqual({ kind: "measured", bars: 4 });
    expect(bars(1_000), "0.575").toEqual({ kind: "measured", bars: 3 });
    expect(bars(2_000), "0.325").toEqual({ kind: "measured", bars: 2 });

    const nearlyFull: Slots = { total: 8, available: 1, connected: 7 };
    expect(
      routeGrade(makeMeasured("a", nearlyFull, 2_000, 1), NO_CONTEXT),
      "0.0875",
    ).toEqual({ kind: "measured", bars: 1 });
  });

  it("keeps its bars through a re-check", () => {
    expect(routeGrade(makeRechecking("a"), NO_CONTEXT))
      .toEqual(routeGrade(makeMeasured("a"), NO_CONTEXT));
  });

  it("discounts our own slot when grading the exit we are on", () => {
    const lastSlot: Slots = { total: 8, available: 0, connected: 8 };
    const onIt = routeGrade(makeMeasured("a", lastSlot, 0, 4), liveOn("a"));
    expect(onIt.kind).toBe("measured");
  });
});

describe("trackWeakRoutes — the grace before a weak route is surfaced", () => {
  const T0 = 1_000_000;
  const byId = (...states: DestinationState[]) =>
    Object.fromEntries(states.map((s) => [s.destination.id, s]));
  const weakFor = (ms: number): Record<string, WeakRoute> =>
    trackWeakRoutes(
      trackWeakRoutes({}, byId(makeWeak("a")), T0),
      byId(makeWeak("a")),
      T0 + ms,
    );

  it("records the first sighting unsurfaced", () => {
    expect(trackWeakRoutes({}, byId(makeWeak("a")), T0)).toEqual({
      a: { since: T0, surfaced: false },
    });
  });

  it("surfaces on the first response at or past the grace", () => {
    expect(weakFor(WEAK_GRACE_MS - 100).a).toEqual({
      since: T0,
      surfaced: false,
    });
    expect(weakFor(WEAK_GRACE_MS).a).toEqual({ since: T0, surfaced: true });
  });

  it("tracks nothing within the band, without a path or before a walk", () => {
    const states = byId(
      makeEligible("ready"),
      makeWeak("edge", 0.9),
      withRouteHealth("dead", noPathRouteHealth()),
      withRouteHealth("gone", unrecoverableRouteHealth()),
      withRouteHealth("unwalked", { ...weakRouteHealth(), walk: null }),
      makeUnavailable("none"),
    );
    expect(trackWeakRoutes({}, states, T0)).toEqual({});
  });

  it("restarts the grace after an answer within the band", () => {
    const seen = trackWeakRoutes({}, byId(makeWeak("a")), T0);
    const recovered = trackWeakRoutes(
      seen,
      byId(makeEligible("a")),
      T0 + 5_000,
    );
    expect(recovered).toEqual({});
    const again = trackWeakRoutes(
      recovered,
      byId(makeWeak("a")),
      T0 + WEAK_GRACE_MS,
    );
    expect(again.a).toEqual({ since: T0 + WEAK_GRACE_MS, surfaced: false });
  });

  it("keeps the grace's start through a worse answer", () => {
    const seen = trackWeakRoutes({}, byId(makeWeak("a")), T0);
    const worse = [
      withRouteHealth("a", noPathRouteHealth()),
      withRouteHealth("a", unrecoverableRouteHealth()),
      withRouteHealth("a", { ...weakRouteHealth(), walk: null }),
      makeUnavailable("a"),
    ];
    for (const state of worse) {
      const dipped = trackWeakRoutes(seen, byId(state), T0 + 5_000);
      const back = trackWeakRoutes(
        dipped,
        byId(makeWeak("a")),
        T0 + WEAK_GRACE_MS,
      );
      expect(back.a).toEqual({ since: T0, surfaced: true });
    }
  });

  it("starts the grace at the first weak sighting, even after a worse start", () => {
    const worse = trackWeakRoutes(
      {},
      byId(withRouteHealth("a", noPathRouteHealth())),
      T0,
    );
    const weak = trackWeakRoutes(
      worse,
      byId(makeWeak("a")),
      T0 + WEAK_GRACE_MS,
    );
    expect(weak.a).toEqual({ since: T0 + WEAK_GRACE_MS, surfaced: false });
  });

  it("drops a destination the response no longer carries", () => {
    const seen = trackWeakRoutes({}, byId(makeWeak("a")), T0);
    expect(trackWeakRoutes(seen, {}, T0 + WEAK_GRACE_MS)).toEqual({});
  });

  it("tracks a full exit below the band: the walk alone decides", () => {
    const fullWeak = withRouteHealth("a", {
      ...weakRouteHealth(),
      quick_probe: checkedQuickProbe(FULL_SLOTS, 10),
    });
    expect(trackWeakRoutes({}, byId(fullWeak), T0).a).toEqual({
      since: T0,
      surfaced: false,
    });
  });
});

describe("routeGrade — a weak route still in its grace", () => {
  it("grades as ready: unmeasured, or Good once measured however fast", () => {
    expect(routeGrade(makeWeak("a"), NO_CONTEXT, false)).toEqual({
      kind: "unmeasured",
    });
    const measuredWeak = withRouteHealth("a", {
      ...weakRouteHealth(),
      quick_probe: checkedQuickProbe(OPEN_SLOTS, 10),
    });
    expect(routeGrade(measuredWeak, NO_CONTEXT, false)).toEqual({
      kind: "measured",
      bars: 3,
    });
  });

  it("still grades a full exit as none", () => {
    const fullWeak = withRouteHealth("a", {
      ...weakRouteHealth(),
      quick_probe: checkedQuickProbe(FULL_SLOTS, 10),
    });
    expect(routeGrade(fullWeak, NO_CONTEXT, false)).toEqual({ kind: "none" });
  });

  it("leaves every other grade alone", () => {
    expect(routeGrade(makeEligible("a"), NO_CONTEXT, false)).toEqual({
      kind: "unmeasured",
    });
    expect(
      routeGrade(withRouteHealth("a", noPathRouteHealth()), NO_CONTEXT, false),
    ).toEqual({ kind: "none" });
  });
});

describe("getExitData — slots and latency measured on the exit", () => {
  it("is null while nothing measured the exit", () => {
    expect(getExitData(makeEligible("a"), null)).toBe(null);
  });

  it("reads a checked quick probe", () => {
    const data = getExitData(makeMeasured("a", OPEN_SLOTS, 80), null);

    expect(data?.slots).toEqual(OPEN_SLOTS);
    expect(data?.rtt).toBe(80);
  });

  it("prefers the live probe on this destination over its quick probe", () => {
    const probe = probeViewFor("a", FULL_SLOTS, 40);

    expect(getExitData(makeMeasured("a", OPEN_SLOTS, 80), probe)?.rtt).toBe(40);
    expect(getExitData(makeMeasured("b", OPEN_SLOTS, 80), probe)?.rtt).toBe(80);
  });

  it("ignores a probe that has not measured anything yet", () => {
    const probe = { ...probeViewFor("a", FULL_SLOTS), load: null };

    expect(getExitData(makeMeasured("a", OPEN_SLOTS, 80), probe)?.rtt).toBe(80);
    expect(getExitData(makeEligible("a"), probe)).toBe(null);
  });

  it("ignores a reopening probe, whose samples outlived their session", () => {
    const probe = {
      ...probeViewFor("a", FULL_SLOTS, 40),
      state: "reopening" as const,
    };

    expect(getExitData(makeMeasured("a", OPEN_SLOTS, 80), probe)?.rtt).toBe(80);
    expect(getExitData(makeEligible("a"), probe)).toBe(null);
  });

  it("keeps what a running check is refreshing, timestamp and all", () => {
    const data = getExitData(makeRechecking("a", FULL_SLOTS, 80), null);

    expect(data?.slots).toEqual(FULL_SLOTS);
    expect(data?.rtt).toBe(80);
    expect(data?.checkedAt).toBe(0);
  });

  it("is null while a first check runs, with nothing to carry forward", () => {
    expect(getExitData(makeRechecking("a", OPEN_SLOTS, 80, false), null))
      .toBe(null);
  });
});

describe("freeSlots — our own session must not count against us", () => {
  it("is null without exit data", () => {
    expect(freeSlots(makeEligible("a"), NO_CONTEXT)).toBe(null);
  });

  it("gives the slot we occupy back to the destination we are on", () => {
    const full = makeMeasured("a", FULL_SLOTS);

    expect(freeSlots(full, NO_CONTEXT)).toBe(0);
    expect(freeSlots(full, liveOn("a"))).toBe(1);
    expect(freeSlots(full, liveOn("b"))).toBe(0);
  });
});

describe("isReady — exit data tightens the walk's verdict", () => {
  it("rejects a full exit, which no connect could succeed against", () => {
    expect(isReady(makeMeasured("a", FULL_SLOTS), NO_CONTEXT)).toBe(false);
  });

  it("keeps the destination we are on ready when we hold its last slot", () => {
    expect(isReady(makeMeasured("a", FULL_SLOTS), liveOn("a"))).toBe(true);
  });

  it("stays ready on the walk alone while nothing measured the exit", () => {
    expect(isReady(makeEligible("a"), NO_CONTEXT)).toBe(true);
  });

  it("never lets exit data promote a weak route", () => {
    const measuredWeak = withRouteHealth("a", {
      ...weakRouteHealth(),
      quick_probe: checkedQuickProbe(OPEN_SLOTS, 10),
    });

    expect(isReady(measuredWeak, NO_CONTEXT)).toBe(false);
  });
});

describe("sortByRouteQuality — measured exits", () => {
  it("ranks every measured exit above every unmeasured one", () => {
    expect(
      sortByRouteQuality({
        "a-promise": makeEligible("a-promise", 4),
        "b-slow": makeMeasured("b-slow", OPEN_SLOTS, 1_800, 1),
      }, NO_CONTEXT),
    ).toEqual(["b-slow", "a-promise"]);
  });

  it("prefers lower latency at equal capacity and diversity", () => {
    expect(
      sortByRouteQuality({
        far: makeMeasured("far", OPEN_SLOTS, 400),
        near: makeMeasured("near", OPEN_SLOTS, 100),
      }, NO_CONTEXT),
    ).toEqual(["near", "far"]);
  });

  it("lets free capacity outweigh a small latency edge", () => {
    // 100 ms one-way is 0.05 of the latency term; 5 of 8 free slots is 0.19 of the capacity term
    expect(
      sortByRouteQuality({
        crowded: makeMeasured("crowded", {
          total: 8,
          available: 1,
          connected: 7,
        }, 100),
        roomy: makeMeasured(
          "roomy",
          { total: 8, available: 6, connected: 2 },
          300,
        ),
      }, NO_CONTEXT),
    ).toEqual(["roomy", "crowded"]);
  });

  it("lets relay diversity break a tie between otherwise equal exits", () => {
    expect(
      sortByRouteQuality({
        single: makeMeasured("single", OPEN_SLOTS, 100, 1),
        diverse: makeMeasured("diverse", OPEN_SLOTS, 100, 3),
      }, NO_CONTEXT),
    ).toEqual(["diverse", "single"]);
  });

  it("saturates latency at one second one-way and diversity at four relays", () => {
    expect(
      sortByRouteQuality({
        "a-glacial": makeMeasured("a-glacial", OPEN_SLOTS, 6_000, 4),
        "b-slow": makeMeasured("b-slow", OPEN_SLOTS, 2_000, 9),
      }, NO_CONTEXT),
    ).toEqual(["a-glacial", "b-slow"]);
  });

  it("drops a full exit into the ineligible tail, above weak routes", () => {
    expect(
      sortByRouteQuality({
        "a-weak": makeWeak("a-weak", 0.5),
        "b-full": makeMeasured("b-full", FULL_SLOTS, 10),
        "c-open": makeMeasured("c-open", OPEN_SLOTS, 500),
      }, NO_CONTEXT),
    ).toEqual(["c-open", "b-full", "a-weak"]);
  });

  it("scores the destination we are on with the slot we occupy given back", () => {
    const destinations = {
      here: makeMeasured("here", { total: 2, available: 0, connected: 2 }, 100),
      there: makeMeasured(
        "there",
        { total: 2, available: 1, connected: 1 },
        100,
      ),
    };

    expect(sortByRouteQuality(destinations, NO_CONTEXT)).toEqual([
      "there",
      "here",
    ]);
    expect(sortByRouteQuality(destinations, liveOn("here"))).toEqual([
      "here",
      "there",
    ]);
  });

  it("reads the live probe for the destination it is on", () => {
    const probe = probeViewFor("a", OPEN_SLOTS, 50);
    const destinations = {
      a: makeEligible("a"),
      b: makeMeasured("b", OPEN_SLOTS, 100),
    };

    expect(sortByRouteQuality(destinations, { probe, liveId: null })).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("isVpnActive", () => {
  it("is true for Connected, Connecting, and Reconnecting", () => {
    expect(isVpnActive("Connected", null)).toBe(true);
    expect(isVpnActive("Connecting", null)).toBe(true);
    expect(isVpnActive("Reconnecting", null)).toBe(true);
  });

  it("is true for Disconnecting only when a target destination is set", () => {
    expect(isVpnActive("Disconnecting", "nodeA")).toBe(true);
    expect(isVpnActive("Disconnecting", null)).toBe(false);
  });

  it("is false for Disconnected and other idle statuses", () => {
    expect(isVpnActive("Disconnected", null)).toBe(false);
    expect(isVpnActive("Disconnected", "nodeA")).toBe(false);
  });
});

describe("sortAlphaDestinations", () => {
  it("places eligible destinations before those with no route health", () => {
    const ready = germanExit("ready");
    const notReady = germanExit("aaaaa");
    const sorted = sortAlphaDestinations(
      [notReady, ready],
      {
        ready: makeEligible("ready"),
        aaaaa: makeUnavailable("aaaaa"),
      },
      NO_CONTEXT,
    );
    expect(sorted[0].id).toBe("ready");
    expect(sorted[1].id).toBe("aaaaa");
  });

  it("places a weak route in the tail with the unreachable ones", () => {
    const weak = germanExit("aaa-weak");
    const ready = germanExit("zzz-ready");
    const sorted = sortAlphaDestinations(
      [weak, ready],
      {
        "aaa-weak": makeWeak("aaa-weak"),
        "zzz-ready": makeEligible("zzz-ready"),
      },
      NO_CONTEXT,
    );
    expect(sorted.map((d) => d.id)).toEqual(["zzz-ready", "aaa-weak"]);
  });

  it("sorts eligible destinations alphabetically within the tier", () => {
    const bravo = germanExit("bravo");
    const alpha = germanExit("alpha");
    const sorted = sortAlphaDestinations(
      [bravo, alpha],
      {
        bravo: makeEligible("bravo", 1),
        alpha: makeEligible("alpha", 5),
      },
      NO_CONTEXT,
    );
    expect(sorted[0].id).toBe("alpha");
    expect(sorted[1].id).toBe("bravo");
  });

  it("sorts non-ready destinations alphabetically within the tier", () => {
    const zeta = germanExit("zeta");
    const mu = germanExit("mu");
    const sorted = sortAlphaDestinations(
      [zeta, mu],
      {
        zeta: makeUnavailable("zeta"),
        mu: makeUnavailable("mu"),
      },
      NO_CONTEXT,
    );
    expect(sorted[0].id).toBe("mu");
    expect(sorted[1].id).toBe("zeta");
  });

  it("orders by the country the list shows, then by label within a country", () => {
    const exitIn = (id: string, country: string) =>
      makeDestination({ id, names: { display_name: country, country } });
    const swiss = exitIn("a-ch", "Switzerland");
    const french = exitIn("z-fr", "France");
    const french2 = exitIn("y-fr", "France");
    const sorted = sortAlphaDestinations(
      [swiss, french, french2],
      {
        "a-ch": makeEligible("a-ch"),
        "z-fr": makeEligible("z-fr"),
        "y-fr": makeEligible("y-fr"),
      },
      NO_CONTEXT,
    );
    expect(sorted.map((d) => d.id)).toEqual(["y-fr", "z-fr", "a-ch"]);
  });
});

describe("sortByRouteQuality", () => {
  it("ranks eligible destinations by distinct first relays, most first", () => {
    expect(
      sortByRouteQuality({
        one: makeEligible("one", 1),
        three: makeEligible("three", 3),
        two: makeEligible("two", 2),
      }, NO_CONTEXT),
    ).toEqual(["three", "two", "one"]);
  });

  it("breaks a relay tie by path count, then by label", () => {
    expect(
      sortByRouteQuality({
        "b-few": makeEligible("b-few", 2, 2),
        "a-few": makeEligible("a-few", 2, 2),
        "c-many": makeEligible("c-many", 2, 6),
      }, NO_CONTEXT),
    ).toEqual(["c-many", "a-few", "b-few"]);
  });

  it("puts every eligible destination before every weak one, whatever the relays", () => {
    expect(
      sortByRouteQuality({
        "aaa-weak": makeWeak("aaa-weak"),
        "bbb-lone": makeEligible("bbb-lone", 1),
      }, NO_CONTEXT),
    ).toEqual(["bbb-lone", "aaa-weak"]);
  });

  it("orders the ineligible tail by best value, closest to eligible first", () => {
    expect(
      sortByRouteQuality({
        "a-far": makeWeak("a-far", 0.2),
        "b-near": makeWeak("b-near", 0.8),
        "c-mid": makeWeak("c-mid", 0.5),
      }, NO_CONTEXT),
    ).toEqual(["b-near", "c-mid", "a-far"]);
  });

  it("sinks no-path, then unknown, then unrecoverable below any weak route", () => {
    expect(
      sortByRouteQuality({
        "a-latched": withRouteHealth("a-latched", unrecoverableRouteHealth()),
        "b-dead": makeUnavailable("b-dead"),
        "c-nopath": withRouteHealth("c-nopath", noPathRouteHealth()),
        "d-weak": makeWeak("d-weak", 0.1),
      }, NO_CONTEXT),
    ).toEqual(["d-weak", "c-nopath", "b-dead", "a-latched"]);
  });

  it("falls back to the label when nothing else separates them", () => {
    expect(
      sortByRouteQuality({
        zeta: makeUnavailable("zeta"),
        alpha: makeUnavailable("alpha"),
      }, NO_CONTEXT),
    ).toEqual(["alpha", "zeta"]);
  });
});

describe("pickStartupTarget — connect-on-startup pick", () => {
  it("returns the preferred location when it is ready", () => {
    const destinations = {
      best: makeEligible("best", 5),
      pref: makeEligible("pref", 1),
    };

    expect(pickStartupTarget(destinations, "pref", null, NO_CONTEXT)).toBe(
      "pref",
    );
  });

  it("starts where the last session left off, outranking preferred", () => {
    const destinations = {
      last: makeEligible("last", 1),
      pref: makeEligible("pref", 5),
    };

    expect(pickStartupTarget(destinations, "pref", "last", NO_CONTEXT)).toBe(
      "last",
    );
  });

  it("falls back through preferred when the last session's destination is not ready", () => {
    const destinations = {
      last: makeUnavailable("last"),
      pref: makeEligible("pref", 1),
      best: makeEligible("best", 5),
    };

    expect(pickStartupTarget(destinations, "pref", "last", NO_CONTEXT)).toBe(
      "pref",
    );
    expect(pickStartupTarget(destinations, null, "last", NO_CONTEXT)).toBe(
      "best",
    );
  });

  it("falls back to the best ready destination when preferred is not ready", () => {
    const destinations = {
      pref: makeUnavailable("pref"),
      lone: makeEligible("lone", 1),
      best: makeEligible("best", 5),
    };

    expect(pickStartupTarget(destinations, "pref", null, NO_CONTEXT)).toBe(
      "best",
    );
    expect(pickStartupTarget(destinations, null, null, NO_CONTEXT)).toBe(
      "best",
    );
  });

  it("ignores a preferred location whose path is weak", () => {
    const destinations = {
      pref: makeWeak("pref", 0.5),
      open: makeEligible("open", 1),
    };

    expect(pickStartupTarget(destinations, "pref", null, NO_CONTEXT)).toBe(
      "open",
    );
  });

  it("never picks a destination that cannot take a connection", () => {
    const destinations = {
      weak: makeWeak("weak"),
      dead: makeUnavailable("dead"),
    };

    expect(pickStartupTarget(destinations, null, null, NO_CONTEXT)).toBeNull();
    expect(pickStartupTarget({}, null, null, NO_CONTEXT)).toBeNull();
  });
});

describe("destinationLabel", () => {
  it("puts the country after the title", () => {
    const dest = makeDestination({
      names: { title: "Frankfurt-1", country: "Germany" },
    });
    expect(destinationLabel(dest)).toBe("Frankfurt-1 - Germany");
  });

  it("is just the title without a country", () => {
    expect(destinationLabel(makeDestination({ id: "my-exit" }))).toBe(
      "my-exit",
    );
  });
});

describe("destinationSearchText", () => {
  it("appends the description so a search can reach it", () => {
    const dest = makeDestination({
      id: "my-exit",
      names: { country: "Germany", description: "no logs kept" },
    });
    expect(destinationSearchText(dest)).toBe(
      "my-exit - Germany no logs kept #xexit",
    );
  });

  it("is the label and short id when no description was published", () => {
    const dest = makeDestination({ id: "my-exit" });
    expect(destinationSearchText(dest)).toBe("my-exit #xexit");
  });
});

describe("isConfigOnly", () => {
  it("is true only for a destination discovery never saw", () => {
    expect(isConfigOnly(makeDestination({ source: "configured" }))).toBe(true);
    expect(isConfigOnly(makeDestination({ source: "discovered" }))).toBe(false);
    expect(
      isConfigOnly(makeDestination({ source: "configured_and_discovered" })),
    )
      .toBe(false);
  });
});

describe("routeGradeLabel", () => {
  it("names each measured band and the unmeasured and weak states", () => {
    expect(routeGradeLabel({ kind: "measured", bars: 4 })).toBe("Excellent");
    expect(routeGradeLabel({ kind: "measured", bars: 3 })).toBe("Good");
    expect(routeGradeLabel({ kind: "measured", bars: 2 })).toBe("Fair");
    expect(routeGradeLabel({ kind: "measured", bars: 1 })).toBe("Poor");
    expect(routeGradeLabel({ kind: "weak" })).toBe("Weak route");
    expect(routeGradeLabel({ kind: "unmeasured" })).toBe("Not measured yet");
    expect(routeGradeLabel({ kind: "none" })).toBe("");
  });
});

describe("pickerRows", () => {
  const dests = ["a", "b", "c", "d", "e", "f", "g"].map((id) =>
    makeDestination({ id, names: { title: `Exit ${id}` } })
  );
  const usableExcept = (...unusable: string[]) => (id: string) =>
    !unusable.includes(id);

  it("drops the unusable exits, keeping the order", () => {
    const rows = pickerRows(dests, {
      query: "",
      current: null,
      pinCurrent: false,
      isUsable: usableExcept("c"),
      limit: null,
    });
    expect(rows.map((d) => d.id)).toEqual(["a", "b", "d", "e", "f", "g"]);
  });

  it("leads with a pinned current exit, usable or not, outside the cap", () => {
    const rows = pickerRows(dests, {
      query: "",
      current: dests[3],
      pinCurrent: true,
      isUsable: usableExcept("d"),
      limit: 5,
    });
    expect(rows.map((d) => d.id)).toEqual(["d", "a", "b", "c", "e", "f"]);
  });

  it("lists the current exit only when it matches the search", () => {
    const search = (query: string) =>
      pickerRows(dests, {
        query,
        current: dests[3],
        pinCurrent: true,
        isUsable: usableExcept(),
        limit: 5,
      }).map((d) => d.id);
    expect(search("exit d")).toEqual(["d"]);
    expect(search("exit g")).toEqual(["g"]);
  });

  it("keeps an unpinned current exit in its place, usable or not", () => {
    const rows = pickerRows(dests, {
      query: "",
      current: dests[2],
      pinCurrent: false,
      isUsable: usableExcept("c"),
      limit: 5,
    });
    expect(rows.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("adds an unpinned current exit past the cap after the capped rows", () => {
    const rows = pickerRows(dests, {
      query: "",
      current: dests[6],
      pinCurrent: false,
      isUsable: usableExcept(),
      limit: 5,
    });
    expect(rows.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e", "g"]);
  });

  it("searches an unpinned current exit in its place", () => {
    const rows = pickerRows(dests, {
      query: "exit",
      current: dests[3],
      pinCurrent: false,
      isUsable: usableExcept("d"),
      limit: 5,
    });
    expect(rows.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("caps the list", () => {
    const rows = pickerRows(dests, {
      query: "",
      current: null,
      pinCurrent: false,
      isUsable: usableExcept(),
      limit: 5,
    });
    expect(rows.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("lists every usable exit when they fit under the cap", () => {
    const rows = pickerRows(dests, {
      query: "",
      current: null,
      pinCurrent: false,
      isUsable: usableExcept("a", "b", "c"),
      limit: 5,
    });
    expect(rows.map((d) => d.id)).toEqual(["d", "e", "f", "g"]);
  });

  it("searches every usable exit past the cap", () => {
    const rows = pickerRows(dests, {
      query: "  EXIT G ",
      current: null,
      pinCurrent: false,
      isUsable: usableExcept(),
      limit: 5,
    });
    expect(rows.map((d) => d.id)).toEqual(["g"]);
  });

  it("finds an exit by the short id its row shows", () => {
    const germanTwin = (id: string, short_id: string) =>
      makeDestination({ id, names: { country: "Germany", short_id } });
    const twins = [germanTwin("x", "469Da"), germanTwin("y", "7Fb10")];
    for (const query of ["469da", "#469Da"]) {
      const rows = pickerRows(twins, {
        query,
        current: null,
        pinCurrent: false,
        isUsable: usableExcept(),
        limit: 5,
      });
      expect(rows.map((d) => d.id)).toEqual(["x"]);
    }
  });

  it("never finds an unusable exit", () => {
    const rows = pickerRows(dests, {
      query: "exit c",
      current: null,
      pinCurrent: false,
      isUsable: usableExcept("c"),
      limit: 5,
    });
    expect(rows).toEqual([]);
  });
});
