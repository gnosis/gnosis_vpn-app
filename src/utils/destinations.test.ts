import { describe, expect, it } from "vitest";
import type {
  Destination,
  DestinationState,
  RouteHealthView,
} from "@src/services/vpnService.ts";
import {
  destinationDescription,
  destinationLabel,
  destinationSearchText,
  destinationTitle,
  isConfigOnly,
  isConfigPinned,
  isReady,
  isReadyForDisplay,
  isVpnActive,
  pickStartupTarget,
  sanitizeMetaText,
  sortAlphaDestinations,
  sortByRouteQuality,
} from "./destinations.ts";
import {
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
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

function makeUnavailable(id: string): DestinationState {
  return withRouteHealth(id, null);
}

describe("isReady — connectable right now", () => {
  it("accepts a routable destination whose best path has full value", () => {
    expect(isReady(makeEligible("a"), null)).toBe(true);
  });

  it("rejects a routable destination whose best path is degraded", () => {
    expect(isReady(makeWeak("a"), null)).toBe(false);
    expect(isReady(makeWeak("a", 0.999), null)).toBe(false);
  });

  it("rejects a destination the walk found no path to", () => {
    expect(isReady(withRouteHealth("a", noPathRouteHealth()), null)).toBe(
      false,
    );
  });

  it("rejects an unrecoverable destination even if it carries a walk", () => {
    const latched = {
      ...unrecoverableRouteHealth(),
      walk: eligibleRouteHealth().walk,
    };
    expect(isReady(withRouteHealth("a", latched), null)).toBe(false);
  });

  it("does not change its mind for the destination we are on", () => {
    expect(isReady(makeWeak("a"), "a")).toBe(false);
    expect(isReady(makeEligible("a"), "a")).toBe(true);
  });

  it("rejects a destination with no health at all", () => {
    expect(isReady(makeUnavailable("a"), null)).toBe(false);
    expect(isReady(undefined, null)).toBe(false);
  });
});

describe("isReadyForDisplay — what the list may present as usable", () => {
  it("passes the live destination through whatever its health says", () => {
    const dead = makeUnavailable("a");

    expect(isReadyForDisplay(dead, "a"), "we are connected to it").toBe(true);
    expect(isReadyForDisplay(dead, null)).toBe(false);
  });

  it("otherwise agrees with isReady", () => {
    const ready = makeEligible("a");
    const weak = makeWeak("b");

    expect(isReadyForDisplay(ready, "c")).toBe(isReady(ready, "c"));
    expect(isReadyForDisplay(weak, "c")).toBe(isReady(weak, "c"));
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
      }),
    ).toEqual(["three", "two", "one"]);
  });

  it("breaks a relay tie by path count, then by label", () => {
    expect(
      sortByRouteQuality({
        "b-few": makeEligible("b-few", 2, 2),
        "a-few": makeEligible("a-few", 2, 2),
        "c-many": makeEligible("c-many", 2, 6),
      }),
    ).toEqual(["c-many", "a-few", "b-few"]);
  });

  it("puts every eligible destination before every weak one, whatever the relays", () => {
    expect(
      sortByRouteQuality({
        "aaa-weak": makeWeak("aaa-weak"),
        "bbb-lone": makeEligible("bbb-lone", 1),
      }),
    ).toEqual(["bbb-lone", "aaa-weak"]);
  });

  it("orders the ineligible tail by best value, closest to eligible first", () => {
    expect(
      sortByRouteQuality({
        "a-far": makeWeak("a-far", 0.2),
        "b-near": makeWeak("b-near", 0.9),
        "c-mid": makeWeak("c-mid", 0.5),
      }),
    ).toEqual(["b-near", "c-mid", "a-far"]);
  });

  it("sinks no-path, then unknown, then unrecoverable below any weak path", () => {
    expect(
      sortByRouteQuality({
        "a-latched": withRouteHealth("a-latched", unrecoverableRouteHealth()),
        "b-dead": makeUnavailable("b-dead"),
        "c-nopath": withRouteHealth("c-nopath", noPathRouteHealth()),
        "d-weak": makeWeak("d-weak", 0.1),
      }),
    ).toEqual(["d-weak", "c-nopath", "b-dead", "a-latched"]);
  });

  it("ignores which destination we are on", () => {
    const destinations = {
      here: makeEligible("here", 1),
      there: makeEligible("there", 3),
    };

    expect(sortByRouteQuality(destinations, "here")).toEqual(
      sortByRouteQuality(destinations, null),
    );
  });

  it("falls back to the label when nothing else separates them", () => {
    expect(
      sortByRouteQuality({
        zeta: makeUnavailable("zeta"),
        alpha: makeUnavailable("alpha"),
      }),
    ).toEqual(["alpha", "zeta"]);
  });
});

describe("pickStartupTarget — connect-on-startup pick", () => {
  it("returns the preferred location when it is ready", () => {
    const destinations = {
      best: makeEligible("best", 5),
      pref: makeEligible("pref", 1),
    };

    expect(pickStartupTarget(destinations, "pref")).toBe("pref");
  });

  it("starts where the last session left off, outranking preferred", () => {
    const destinations = {
      last: makeEligible("last", 1),
      pref: makeEligible("pref", 5),
    };

    expect(pickStartupTarget(destinations, "pref", "last")).toBe("last");
  });

  it("falls back through preferred when the last session's destination is not ready", () => {
    const destinations = {
      last: makeUnavailable("last"),
      pref: makeEligible("pref", 1),
      best: makeEligible("best", 5),
    };

    expect(pickStartupTarget(destinations, "pref", "last")).toBe("pref");
    expect(pickStartupTarget(destinations, null, "last")).toBe("best");
  });

  it("falls back to the best ready destination when preferred is not ready", () => {
    const destinations = {
      pref: makeUnavailable("pref"),
      lone: makeEligible("lone", 1),
      best: makeEligible("best", 5),
    };

    expect(pickStartupTarget(destinations, "pref")).toBe("best");
    expect(pickStartupTarget(destinations, null)).toBe("best");
  });

  it("ignores a preferred location whose path is weak", () => {
    const destinations = {
      pref: makeWeak("pref", 0.9),
      open: makeEligible("open", 1),
    };

    expect(pickStartupTarget(destinations, "pref")).toBe("open");
  });

  it("never picks a destination that cannot take a connection", () => {
    const destinations = {
      weak: makeWeak("weak"),
      dead: makeUnavailable("dead"),
    };

    expect(pickStartupTarget(destinations, null)).toBeNull();
    expect(pickStartupTarget({}, null)).toBeNull();
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
