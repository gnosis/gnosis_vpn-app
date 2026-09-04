import { describe, expect, it } from "vitest";
import type {
  Destination,
  DestinationState,
  Slots,
} from "@src/services/vpnService.ts";
import {
  isReady,
  isReadyForDisplay,
  isVpnActive,
  pickStartupTarget,
  sortAlphaDestinations,
  sortByCapacityAwareLatency,
} from "./destinations.ts";

const BASE_DESTINATION: Destination = {
  id: "a",
  meta: { location: "EU" },
  address: "0x1234",
  routing: 1,
};

function makeReadyToConnect(
  id: string,
  pingNanos = 50_000_000,
  slots: Slots = { available: 5, connected: 2 },
): DestinationState {
  return {
    destination: { ...BASE_DESTINATION, id },
    route_health: {
      state: {
        state: "ReadyToConnect",
        exit: {
          checked_at: 0,
          versions: { versions: [], latest: "" },
          ping_rtt: pingNanos / 1_000_000,
          health: {
            slots,
            load_avg: { one: 0.5, five: 0.5, fifteen: 0.5, nproc: 4 },
          },
        },
      },
      last_error: null,
      checking_since: null,
      consecutive_failures: 0,
    },
  };
}

function makeUnavailable(id: string): DestinationState {
  return {
    destination: { ...BASE_DESTINATION, id },
    route_health: null,
  };
}

describe("isReady — connectable right now", () => {
  it("accepts a ready destination with a free slot", () => {
    expect(isReady(makeReadyToConnect("a"), null)).toBe(true);
  });

  it("rejects a full destination, which no connect could succeed against", () => {
    const full = makeReadyToConnect("a", 50_000_000, {
      available: 0,
      connected: 5,
    });

    expect(isReady(full, null)).toBe(false);
  });

  it("does not count our own session against the destination we are on", () => {
    const full = makeReadyToConnect("a", 50_000_000, {
      available: 0,
      connected: 5,
    });

    expect(isReady(full, "a"), "the slot we free by leaving is ours").toBe(
      true,
    );
    expect(isReady(full, "b")).toBe(false);
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
    const ready = makeReadyToConnect("a");

    expect(isReadyForDisplay(ready, "b")).toBe(isReady(ready, "b"));
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
  it("places ReadyToConnect destinations before those with no route health", () => {
    const ready: Destination = { ...BASE_DESTINATION, id: "ready" };
    const notReady: Destination = { ...BASE_DESTINATION, id: "aaaaa" };
    const sorted = sortAlphaDestinations(
      [notReady, ready],
      {
        ready: makeReadyToConnect("ready"),
        aaaaa: makeUnavailable("aaaaa"),
      },
    );
    expect(sorted[0].id).toBe("ready");
    expect(sorted[1].id).toBe("aaaaa");
  });

  it("sorts ReadyToConnect destinations alphabetically within the tier", () => {
    const bravo: Destination = { ...BASE_DESTINATION, id: "bravo" };
    const alpha: Destination = { ...BASE_DESTINATION, id: "alpha" };
    const sorted = sortAlphaDestinations(
      [bravo, alpha],
      {
        bravo: makeReadyToConnect("bravo"),
        alpha: makeReadyToConnect("alpha"),
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

describe("sortByCapacityAwareLatency", () => {
  it("applies the malus even when total slots are equal", () => {
    // busy is 40ms faster, but its 4 connected clients cost 400ms
    expect(
      sortByCapacityAwareLatency({
        idle: makeReadyToConnect("idle", 60_000_000, {
          available: 8,
          connected: 0,
        }),
        busy: makeReadyToConnect("busy", 20_000_000, {
          available: 4,
          connected: 4,
        }),
      }),
    ).toEqual(["idle", "busy"]);
  });

  it("applies the connected-client malus when total slots differ", () => {
    expect(
      sortByCapacityAwareLatency({
        small: makeReadyToConnect("small", 20_000_000, {
          available: 1,
          connected: 4,
        }),
        large: makeReadyToConnect("large", 60_000_000, {
          available: 9,
          connected: 1,
        }),
      }),
    ).toEqual(["large", "small"]);
  });

  it("sorts full destinations last regardless of latency", () => {
    expect(
      sortByCapacityAwareLatency({
        full: makeReadyToConnect("full", 10_000_000, {
          available: 0,
          connected: 7,
        }),
        slow: makeReadyToConnect("slow", 200_000_000, {
          available: 3,
          connected: 4,
        }),
      }),
    ).toEqual(["slow", "full"]);
  });

  it("drops our own session from the malus for the destination we are on", () => {
    const destinations = {
      // same total capacity, so only the malus can separate them
      here: makeReadyToConnect("here", 80_000_000, {
        available: 3,
        connected: 5,
      }),
      there: makeReadyToConnect("there", 40_000_000, {
        available: 6,
        connected: 2,
      }),
    };

    expect(sortByCapacityAwareLatency(destinations, null)[0]).toBe("there");
    // 80 + 4*100 still loses to 40 + 2*100, so the discount alone must not flip it
    expect(sortByCapacityAwareLatency(destinations, "here")[0]).toBe("there");
  });

  it("stops calling the destination we are on full when we hold its last slot", () => {
    const destinations = {
      here: makeReadyToConnect("here", 90_000_000, {
        available: 0,
        connected: 4,
      }),
      there: makeReadyToConnect("there", 10_000_000, {
        available: 0,
        connected: 4,
      }),
    };

    // both read as full to a stranger, so neither is demoted and latency decides
    expect(sortByCapacityAwareLatency(destinations, null)).toEqual([
      "there",
      "here",
    ]);
    // ours is not full for us, so it outranks the one that is
    expect(sortByCapacityAwareLatency(destinations, "here")[0]).toBe("here");
  });

  it("exempts only one client for the destination we are on, not more", () => {
    expect(
      sortByCapacityAwareLatency({
        live: makeReadyToConnect("live", 50_000_000, {
          available: 4,
          connected: 2,
        }),
        other: makeReadyToConnect("other", 50_000_000, {
          available: 4,
          connected: 0,
        }),
      }, "live")[0],
    ).toBe("other");
  });

  it("places full destinations after non-full but before not-ready ones", () => {
    // ids chosen so an alphabetical sort would invert the expected order
    expect(
      sortByCapacityAwareLatency({
        "aaa-dead": makeUnavailable("aaa-dead"),
        "bbb-full": makeReadyToConnect("bbb-full", 10_000_000, {
          available: 0,
          connected: 5,
        }),
        "ccc-open": makeReadyToConnect("ccc-open", 200_000_000),
      }),
    ).toEqual(["ccc-open", "bbb-full", "aaa-dead"]);
  });

  it("falls back to the label when neither has latency data", () => {
    expect(
      sortByCapacityAwareLatency({
        zeta: makeUnavailable("zeta"),
        alpha: makeUnavailable("alpha"),
      }),
    ).toEqual(["alpha", "zeta"]);
  });
});

describe("pickStartupTarget — connect-on-startup pick", () => {
  it("returns the preferred location when it is ready", () => {
    const destinations = {
      fast: makeReadyToConnect("fast", 10_000_000),
      pref: makeReadyToConnect("pref", 200_000_000),
    };

    expect(pickStartupTarget(destinations, "pref")).toBe("pref");
  });

  it("starts where the last session left off, outranking preferred", () => {
    const destinations = {
      last: makeReadyToConnect("last", 200_000_000),
      pref: makeReadyToConnect("pref", 10_000_000),
    };

    expect(pickStartupTarget(destinations, "pref", "last")).toBe("last");
  });

  it("falls back through preferred when the last session's destination is not ready", () => {
    const destinations = {
      last: makeUnavailable("last"),
      pref: makeReadyToConnect("pref", 200_000_000),
      fast: makeReadyToConnect("fast", 10_000_000),
    };

    expect(pickStartupTarget(destinations, "pref", "last")).toBe("pref");
    expect(pickStartupTarget(destinations, null, "last")).toBe("fast");
  });

  it("falls back to the best ready destination when preferred is not ready", () => {
    const destinations = {
      pref: makeUnavailable("pref"),
      slow: makeReadyToConnect("slow", 200_000_000),
      fast: makeReadyToConnect("fast", 10_000_000),
    };

    expect(pickStartupTarget(destinations, "pref")).toBe("fast");
    expect(pickStartupTarget(destinations, null)).toBe("fast");
  });

  it("ignores a preferred location that is full", () => {
    const destinations = {
      pref: makeReadyToConnect("pref", 10_000_000, {
        available: 0,
        connected: 5,
      }),
      open: makeReadyToConnect("open", 200_000_000),
    };

    expect(pickStartupTarget(destinations, "pref")).toBe("open");
  });

  it("never picks a destination that cannot take a connection", () => {
    const destinations = {
      full: makeReadyToConnect("full", 10_000_000, {
        available: 0,
        connected: 5,
      }),
      dead: makeUnavailable("dead"),
    };

    expect(pickStartupTarget(destinations, null)).toBeNull();
    expect(pickStartupTarget({}, null)).toBeNull();
  });
});
