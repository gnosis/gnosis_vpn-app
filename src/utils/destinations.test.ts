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
  gradeRank,
  isConfigOnly,
  isReady,
  isReadyForDisplay,
  isSelectable,
  isVpnActive,
  modeSwitchReconnectTarget,
  NO_CONTEXT,
  pickerRows,
  pickStartupTarget,
  type RankContext,
  routeGrade,
  routeGradeLabel,
  sortAlphaDestinations,
  sortByGrade,
} from "./destinations.ts";
import {
  checkedQuickProbe,
  checkingQuickProbe,
  eligibleRouteHealth,
  gradedRouteHealth,
  makeDestination,
  noPathRouteHealth,
  probeViewFor,
  quickProbeCheck,
  unrecoverableRouteHealth,
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

function makeEligible(id: string, percentOfBest = 100): DestinationState {
  return withRouteHealth(id, gradedRouteHealth(percentOfBest));
}

/** Routable, but the daemon has not graded its path yet. */
function makeUngraded(id: string): DestinationState {
  return withRouteHealth(id, {
    ...eligibleRouteHealth(),
    percent_of_best: null,
  });
}

const OPEN_SLOTS: Slots = { total: 8, available: 6, connected: 2 };
const FULL_SLOTS: Slots = { total: 4, available: 0, connected: 4 };

/** Graded by the daemon and measured by a quick probe. */
function makeMeasured(
  id: string,
  slots: Slots = OPEN_SLOTS,
  rtt = 100,
  percentOfBest = 100,
): DestinationState {
  return withRouteHealth(id, {
    ...gradedRouteHealth(percentOfBest),
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
  it("accepts a routable destination with any percent of best", () => {
    expect(isReady(makeEligible("a", 100), NO_CONTEXT)).toBe(true);
    expect(isReady(makeEligible("a", 10), NO_CONTEXT)).toBe(true);
  });

  it("rejects a routable destination the daemon has not graded", () => {
    expect(isReady(makeUngraded("a"), NO_CONTEXT)).toBe(false);
  });

  it("rejects a destination the walk found no path to", () => {
    expect(isReady(withRouteHealth("a", noPathRouteHealth()), NO_CONTEXT)).toBe(
      false,
    );
  });

  it("rejects an unrecoverable destination even if it carries a percent of best", () => {
    const latched: RouteHealthView = {
      ...unrecoverableRouteHealth(),
      percent_of_best: 100,
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
    const ungraded = makeUngraded("b");

    expect(isReadyForDisplay(ready, liveOn("c"))).toBe(
      isReady(ready, liveOn("c")),
    );
    expect(isReadyForDisplay(ungraded, liveOn("c"))).toBe(
      isReady(ungraded, liveOn("c")),
    );
  });
});

describe("isSelectable — what the user may pick", () => {
  it("accepts an ungraded route: the daemon connects over any Routable route", () => {
    expect(isSelectable(makeUngraded("a"), NO_CONTEXT)).toBe(true);
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

describe("routeGrade — the daemon's percent of best as bars", () => {
  it("grades nothing that is not selectable", () => {
    expect(routeGrade(undefined, NO_CONTEXT)).toEqual({ kind: "none" });
    expect(routeGrade(makeUnavailable("a"), NO_CONTEXT)).toEqual({
      kind: "none",
    });
    expect(routeGrade(withRouteHealth("a", noPathRouteHealth()), NO_CONTEXT))
      .toEqual({ kind: "none" });
  });

  it("grades a full exit none, whatever its percent of best", () => {
    expect(routeGrade(makeMeasured("a", FULL_SLOTS), NO_CONTEXT)).toEqual({
      kind: "none",
    });
  });

  it("cuts bars at 90, 60 and 25 percent of the best exit", () => {
    const bars = (percentOfBest: number) => {
      const grade = routeGrade(makeEligible("a", percentOfBest), NO_CONTEXT);
      return grade.kind === "graded" ? grade.bars : null;
    };
    expect([100, 90, 89, 60, 59, 25, 24, 0].map(bars)).toEqual([
      4,
      4,
      3,
      3,
      2,
      2,
      1,
      1,
    ]);
  });

  it("grades by percent of best alone, whatever the exit measured", () => {
    expect(routeGrade(makeMeasured("a", OPEN_SLOTS, 6_000), NO_CONTEXT))
      .toEqual({ kind: "graded", bars: 4, percentOfBest: 100 });
  });

  it("holds a selectable exit without a percent of best at unmeasured", () => {
    expect(routeGrade(makeUngraded("a"), NO_CONTEXT)).toEqual({
      kind: "unmeasured",
    });
  });

  it("keeps its bars through a re-check", () => {
    expect(routeGrade(makeRechecking("a"), NO_CONTEXT))
      .toEqual(routeGrade(makeMeasured("a"), NO_CONTEXT));
  });

  it("still grades the exit we are on when we hold its last slot", () => {
    const lastSlot: Slots = { total: 8, available: 0, connected: 8 };
    expect(routeGrade(makeMeasured("a", lastSlot), liveOn("a"))).toEqual({
      kind: "graded",
      bars: 4,
      percentOfBest: 100,
    });
  });
});

describe("gradeRank — lower is better", () => {
  it("ranks graded by bars, then unmeasured, then none", () => {
    const ranks = [
      makeEligible("a", 100),
      makeEligible("a", 75),
      makeEligible("a", 40),
      makeEligible("a", 10),
      makeUngraded("a"),
      makeUnavailable("a"),
    ].map((state) => gradeRank(state, NO_CONTEXT));
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5]);
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

describe("isReady — exit data tightens the daemon's verdict", () => {
  it("rejects a full exit, which no connect could succeed against", () => {
    expect(isReady(makeMeasured("a", FULL_SLOTS), NO_CONTEXT)).toBe(false);
  });

  it("keeps the destination we are on ready when we hold its last slot", () => {
    expect(isReady(makeMeasured("a", FULL_SLOTS), liveOn("a"))).toBe(true);
  });

  it("stays ready on the percent of best alone while nothing measured the exit", () => {
    expect(isReady(makeEligible("a"), NO_CONTEXT)).toBe(true);
  });

  it("never lets exit data promote an ungraded route", () => {
    const measuredUngraded = withRouteHealth("a", {
      ...eligibleRouteHealth(),
      percent_of_best: null,
      quick_probe: checkedQuickProbe(OPEN_SLOTS, 10),
    });

    expect(isReady(measuredUngraded, NO_CONTEXT)).toBe(false);
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

  it("places an ungraded route in the tail with the unreachable ones", () => {
    const ungraded = germanExit("aaa-ungraded");
    const ready = germanExit("zzz-ready");
    const sorted = sortAlphaDestinations(
      [ungraded, ready],
      {
        "aaa-ungraded": makeUngraded("aaa-ungraded"),
        "zzz-ready": makeEligible("zzz-ready"),
      },
      NO_CONTEXT,
    );
    expect(sorted.map((d) => d.id)).toEqual(["zzz-ready", "aaa-ungraded"]);
  });

  it("sorts eligible destinations alphabetically within the tier, whatever the percent of best", () => {
    const bravo = germanExit("bravo");
    const alpha = germanExit("alpha");
    const sorted = sortAlphaDestinations(
      [bravo, alpha],
      {
        bravo: makeEligible("bravo", 100),
        alpha: makeEligible("alpha", 10),
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

describe("sortByGrade — the one order", () => {
  const named = (state: DestinationState, country: string) => ({
    ...state,
    destination: makeDestination({
      id: state.destination.id,
      names: { display_name: country, country },
    }),
  });
  const ids = (
    destinations: Record<string, DestinationState>,
    context: RankContext = NO_CONTEXT,
  ) => sortByGrade(destinations, context).map((d) => d.id);

  it("orders most bars first, then unmeasured, then the rest", () => {
    expect(ids({
      "a-none": makeUnavailable("a-none"),
      "b-unmeasured": makeUngraded("b-unmeasured"),
      "c-far": makeEligible("c-far", 10),
      "d-behind": makeEligible("d-behind", 40),
      "e-close": makeEligible("e-close", 75),
      "f-best": makeEligible("f-best", 100),
    })).toEqual([
      "f-best",
      "e-close",
      "d-behind",
      "c-far",
      "b-unmeasured",
      "a-none",
    ]);
  });

  it("orders exits of one grade by name, not by what the exit measured", () => {
    expect(ids({
      "a-ch": named(makeMeasured("a-ch", OPEN_SLOTS, 0), "Switzerland"),
      "b-fr": named(makeMeasured("b-fr", OPEN_SLOTS, 2_000), "France"),
      "c-at": named(makeEligible("c-at"), "Austria"),
    })).toEqual(["c-at", "b-fr", "a-ch"]);
  });

  it("sinks a full exit with the ungradeable ones, unless we hold its last slot", () => {
    const destinations = {
      "a-full": makeMeasured("a-full", FULL_SLOTS, 10),
      "b-far": makeEligible("b-far", 10),
      "c-none": makeUnavailable("c-none"),
    };
    expect(ids(destinations)).toEqual(["b-far", "a-full", "c-none"]);
    expect(ids(destinations, liveOn("a-full")))
      .toEqual(["a-full", "b-far", "c-none"]);
  });
});

describe("modeSwitchReconnectTarget — reconnect after a mode switch", () => {
  const destinations = {
    other: makeEligible("other", 40),
    best: makeEligible("best", 100),
  };

  it("connects to the Auto pick once the service runs the new mode", () => {
    expect(
      modeSwitchReconnectTarget(
        "bootstrap",
        "bootstrap",
        destinations,
        NO_CONTEXT,
      ),
    ).toBe("best");
    expect(
      modeSwitchReconnectTarget("normal", "normal", destinations, NO_CONTEXT),
    ).toBe("best");
  });

  it("waits while the status still shows the old mode", () => {
    expect(
      modeSwitchReconnectTarget(
        "bootstrap",
        "normal",
        destinations,
        NO_CONTEXT,
      ),
    ).toBeNull();
  });

  it("waits until an exit of the new mode is ready", () => {
    const notReady = { slow: makeUngraded("slow") };

    expect(
      modeSwitchReconnectTarget("bootstrap", "bootstrap", notReady, NO_CONTEXT),
    ).toBeNull();
  });

  it("does nothing without a pending switch", () => {
    expect(
      modeSwitchReconnectTarget(null, "bootstrap", destinations, NO_CONTEXT),
    ).toBeNull();
  });
});

describe("pickStartupTarget — connect-on-startup pick", () => {
  it("returns the preferred location when it is ready", () => {
    const destinations = {
      best: makeEligible("best", 100),
      pref: makeEligible("pref", 10),
    };

    expect(pickStartupTarget(destinations, "pref", null, NO_CONTEXT)).toBe(
      "pref",
    );
  });

  it("starts where the last session left off, outranking preferred", () => {
    const destinations = {
      last: makeEligible("last", 10),
      pref: makeEligible("pref", 100),
    };

    expect(pickStartupTarget(destinations, "pref", "last", NO_CONTEXT)).toBe(
      "last",
    );
  });

  it("falls back through preferred when the last session's destination is not ready", () => {
    const destinations = {
      last: makeUnavailable("last"),
      pref: makeEligible("pref", 10),
      best: makeEligible("best", 100),
    };

    expect(pickStartupTarget(destinations, "pref", "last", NO_CONTEXT)).toBe(
      "pref",
    );
    expect(pickStartupTarget(destinations, null, "last", NO_CONTEXT)).toBe(
      "best",
    );
  });

  it("falls back to the best graded destination when preferred is not ready", () => {
    const destinations = {
      pref: makeUnavailable("pref"),
      "a-lone": makeEligible("a-lone", 40),
      "z-best": makeEligible("z-best", 100),
    };

    expect(pickStartupTarget(destinations, "pref", null, NO_CONTEXT)).toBe(
      "z-best",
    );
    expect(pickStartupTarget(destinations, null, null, NO_CONTEXT)).toBe(
      "z-best",
    );
  });

  it("ignores a preferred location the daemon has not graded", () => {
    const destinations = {
      pref: makeUngraded("pref"),
      open: makeEligible("open", 10),
    };

    expect(pickStartupTarget(destinations, "pref", null, NO_CONTEXT)).toBe(
      "open",
    );
  });

  it("never picks a destination that cannot take a connection", () => {
    const destinations = {
      ungraded: makeUngraded("ungraded"),
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
  it("names only the unmeasured state; bars speak for a graded one", () => {
    expect(routeGradeLabel({ kind: "unmeasured" })).toBe("Not measured yet");
    expect(routeGradeLabel({ kind: "graded", bars: 4, percentOfBest: 100 }))
      .toBe("");
    expect(routeGradeLabel({ kind: "graded", bars: 1, percentOfBest: 10 }))
      .toBe("");
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

  it("leaves out an unpinned current exit past the cap", () => {
    const rows = pickerRows(dests, {
      query: "",
      current: dests[6],
      pinCurrent: false,
      isUsable: usableExcept(),
      limit: 5,
    });
    expect(rows.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("pins a current exit missing from the sorted list", () => {
    const outsider = makeDestination({ id: "z", names: { title: "Exit z" } });
    const rows = (pinCurrent: boolean) =>
      pickerRows(dests.slice(0, 2), {
        query: "",
        current: outsider,
        pinCurrent,
        isUsable: usableExcept(),
        limit: null,
      }).map((d) => d.id);
    expect(rows(true)).toEqual(["z", "a", "b"]);
    expect(rows(false)).toEqual(["a", "b"]);
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
