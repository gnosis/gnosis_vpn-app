import { describe, expect, it } from "vitest";
import type {
  Destination,
  DestinationState,
  RouteHealthView,
  Slots,
} from "@src/services/vpnService.ts";
import {
  destinationDescription,
  destinationLabel,
  destinationSearchText,
  destinationTitle,
  freeSlots,
  getExitData,
  isConfigOnly,
  isConfigPinned,
  isReady,
  isReadyForDisplay,
  isVpnActive,
  NO_CONTEXT,
  pickStartupTarget,
  type RankContext,
  sanitizeMetaText,
  sortAlphaDestinations,
  sortByRouteQuality,
} from "./destinations.ts";
import {
  checkedQuickProbe,
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
  probeViewFor,
  unrecoverableRouteHealth,
  weakRouteHealth,
} from "@src/testing/destinations.ts";

const BASE_DESTINATION: Destination = makeDestination({
  id: "a",
  address: "0x1234",
  meta: { location: "EU" },
});

function withRouteHealth(
  id: string,
  route_health: RouteHealthView | null,
): DestinationState {
  return { destination: { ...BASE_DESTINATION, id }, route_health };
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

function liveOn(liveId: string | null): RankContext {
  return { probe: null, liveId };
}

function makeUnavailable(id: string): DestinationState {
  return withRouteHealth(id, null);
}

describe("isReady — connectable right now", () => {
  it("accepts a routable destination whose best path has full value", () => {
    expect(isReady(makeEligible("a"), NO_CONTEXT)).toBe(true);
  });

  it("rejects a routable destination whose best path is degraded", () => {
    expect(isReady(makeWeak("a"), NO_CONTEXT)).toBe(false);
    expect(isReady(makeWeak("a", 0.999), NO_CONTEXT)).toBe(false);
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

  it("never lets exit data promote a weak path", () => {
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

  it("drops a full exit into the ineligible tail, above weak paths", () => {
    expect(
      sortByRouteQuality({
        "a-weak": makeWeak("a-weak", 0.9),
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
    const ready: Destination = { ...BASE_DESTINATION, id: "ready" };
    const notReady: Destination = { ...BASE_DESTINATION, id: "aaaaa" };
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

  it("places a weak path in the tail with the unreachable ones", () => {
    const weak: Destination = { ...BASE_DESTINATION, id: "aaa-weak" };
    const ready: Destination = { ...BASE_DESTINATION, id: "zzz-ready" };
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
    const bravo: Destination = { ...BASE_DESTINATION, id: "bravo" };
    const alpha: Destination = { ...BASE_DESTINATION, id: "alpha" };
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
    const zeta: Destination = { ...BASE_DESTINATION, id: "zeta" };
    const mu: Destination = { ...BASE_DESTINATION, id: "mu" };
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
        "b-near": makeWeak("b-near", 0.9),
        "c-mid": makeWeak("c-mid", 0.5),
      }, NO_CONTEXT),
    ).toEqual(["b-near", "c-mid", "a-far"]);
  });

  it("sinks no-path, then unknown, then unrecoverable below any weak path", () => {
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
      pref: makeWeak("pref", 0.9),
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

// Mirrors the client's naming rule so the app and gvpn-ctl name an exit the same way.
describe("destinationTitle", () => {
  it("is the connect id without a name", () => {
    expect(destinationTitle(makeDestination({ id: "my-exit" }))).toBe(
      "my-exit",
    );
  });

  it("leads with a configured id, the user's own handle, and brackets the published name", () => {
    const dest = makeDestination({
      id: "my-exit",
      source: "ConfiguredAndDiscovered",
      meta: { name: "Frankfurt-1" },
    });
    expect(destinationTitle(dest)).toBe("my-exit (Frankfurt-1)");
  });

  it("does not repeat a name spelled exactly like the configured id", () => {
    const dest = makeDestination({
      id: "frankfurt-1",
      source: "ConfiguredAndDiscovered",
      meta: { name: "frankfurt-1" },
    });
    expect(destinationTitle(dest)).toBe("frankfurt-1");
  });

  it("still shows a pinned name spelled like the id, so the override stays visible", () => {
    const dest = makeDestination({
      id: "frankfurt-1",
      source: "ConfiguredAndDiscovered",
      meta: { name: "frankfurt-1" },
      overrides: { configured_meta: { name: "frankfurt-1" } },
    });
    expect(destinationTitle(dest)).toBe("frankfurt-1 (frankfurt-1)");
  });

  it("treats a name that sanitizes to nothing as absent", () => {
    const dest = makeDestination({
      id: "0xabc-1234",
      source: "Discovered",
      meta: { name: "\u200b\u202e" },
    });
    expect(destinationTitle(dest)).toBe("0xabc-1234");
  });

  it("is the published name alone for a discovered destination, whose id is that name slugged", () => {
    const dest = makeDestination({
      id: "frankfurt-1-a1b2",
      source: "Discovered",
      meta: { name: "Frankfurt-1" },
    });
    expect(destinationTitle(dest)).toBe("Frankfurt-1");
  });

  it("puts the location after the title in the label", () => {
    const dest = makeDestination({
      id: "frankfurt-1-a1b2",
      source: "Discovered",
      meta: { name: "Frankfurt-1", location: "Germany" },
    });
    expect(destinationLabel(dest)).toBe("Frankfurt-1 - Germany");
  });
});

describe("sanitizeMetaText", () => {
  it("strips control and bidi-override characters", () => {
    expect(sanitizeMetaText("\u001b[2K\u202eGermany\u200b")).toBe("[2KGermany");
  });

  it("elides after 64 code points, counting characters rather than UTF-16 units", () => {
    const long = "\u{1F1E9}".repeat(70);
    const shown = sanitizeMetaText(long);
    expect(Array.from(shown)).toHaveLength(65);
    expect(shown.endsWith("\u2026")).toBe(true);
  });

  it("leaves a short plain value alone", () => {
    expect(sanitizeMetaText("Germany")).toBe("Germany");
  });
});

describe("destinationDescription", () => {
  it("is null when the operator published none", () => {
    expect(destinationDescription(makeDestination())).toBeNull();
  });

  it("sanitizes the published text like every other label", () => {
    const dest = makeDestination({
      meta: { description: "\u202e10Gbit uplink\u200b" },
    });
    expect(destinationDescription(dest)).toBe("10Gbit uplink");
  });

  it("elides past 64 characters", () => {
    const dest = makeDestination({ meta: { description: "a".repeat(70) } });
    expect(destinationDescription(dest)).toBe("a".repeat(64) + "\u2026");
  });
});

describe("destinationSearchText", () => {
  it("appends the description so a search can reach it", () => {
    const dest = makeDestination({
      id: "my-exit",
      meta: { location: "Germany", description: "no logs kept" },
    });
    expect(destinationSearchText(dest)).toBe("my-exit - Germany no logs kept");
  });

  it("is just the label when no description was published", () => {
    const dest = makeDestination({ id: "my-exit" });
    expect(destinationSearchText(dest)).toBe("my-exit");
  });

  it("keeps a configured id searchable beside the published name", () => {
    const dest = makeDestination({
      id: "pinned-exit",
      source: "ConfiguredAndDiscovered",
      meta: { name: "Frankfurt-1" },
    });
    expect(destinationSearchText(dest)).toContain("pinned-exit");
  });
});

describe("isConfigOnly", () => {
  it("is true only for a destination discovery never saw", () => {
    expect(isConfigOnly(makeDestination({ source: "Configured" }))).toBe(true);
    expect(isConfigOnly(makeDestination({ source: "Discovered" }))).toBe(false);
    expect(isConfigOnly(makeDestination({ source: "ConfiguredAndDiscovered" })))
      .toBe(false);
  });
});

// The ctl's rule: configuration's own values are marked only where config and discovery mix.
describe("isConfigPinned", () => {
  const pinnedLocation = { configured_meta: { location: "Germany" } };

  it("marks a value configuration set on a configured-and-discovered destination", () => {
    const dest = makeDestination({
      source: "ConfiguredAndDiscovered",
      meta: { location: "Germany" },
      overrides: pinnedLocation,
    });
    expect(isConfigPinned(dest, "location")).toBe(true);
    expect(isConfigPinned(dest, "name")).toBe(false);
  });

  it("marks a pinned description", () => {
    const dest = makeDestination({
      source: "ConfiguredAndDiscovered",
      meta: { description: "10Gbit uplink" },
      overrides: { configured_meta: { description: "10Gbit uplink" } },
    });
    expect(isConfigPinned(dest, "description")).toBe(true);
  });

  it("marks nothing on a config-only destination, where every value is config's by definition", () => {
    const dest = makeDestination({
      source: "Configured",
      meta: { location: "Germany" },
      overrides: pinnedLocation,
    });
    expect(isConfigPinned(dest, "location")).toBe(false);
  });

  it("marks nothing on a discovered-only destination", () => {
    const dest = makeDestination({
      source: "Discovered",
      meta: { location: "Germany" },
    });
    expect(isConfigPinned(dest, "location")).toBe(false);
  });
});
