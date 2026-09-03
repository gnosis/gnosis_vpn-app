import { describe, expect, it } from "vitest";
import type {
  Destination,
  DestinationState,
  Slots,
} from "@src/services/vpnService.ts";
import {
  isVpnActive,
  resolveAutoDestination,
  sortAlphaDestinations,
  sortByCapacityAwareLatency,
  sortByHealthScore,
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

describe("resolveAutoDestination", () => {
  it("returns null when no destinations are available", () => {
    expect(resolveAutoDestination([], {}, null)).toBeNull();
  });

  it("returns the best health-sorted node when no preferred location is set", () => {
    const slow: Destination = { ...BASE_DESTINATION, id: "slow" };
    const fast: Destination = { ...BASE_DESTINATION, id: "fast" };
    const result = resolveAutoDestination(
      [slow, fast],
      {
        slow: makeReadyToConnect("slow", 100_000_000),
        fast: makeReadyToConnect("fast", 20_000_000),
      },
      null,
    );
    expect(result?.id).toBe("fast");
  });

  it("returns the preferred location when it is available and ready", () => {
    const nodeA: Destination = { ...BASE_DESTINATION, id: "nodeA" };
    const preferred: Destination = { ...BASE_DESTINATION, id: "preferred" };
    const result = resolveAutoDestination(
      [nodeA, preferred],
      {
        nodeA: makeReadyToConnect("nodeA", 10_000_000),
        preferred: makeReadyToConnect("preferred", 200_000_000),
      },
      "preferred",
    );
    expect(result?.id).toBe("preferred");
  });

  it("falls back to best health-sorted node when preferred location is not available", () => {
    const nodeA: Destination = { ...BASE_DESTINATION, id: "nodeA" };
    const result = resolveAutoDestination(
      [nodeA],
      { nodeA: makeReadyToConnect("nodeA") },
      "missing-preferred",
    );
    expect(result?.id).toBe("nodeA");
  });

  it("falls back to best healthy node when preferred is not ReadyToConnect (null health)", () => {
    const nodeA: Destination = { ...BASE_DESTINATION, id: "nodeA" };
    const preferred: Destination = { ...BASE_DESTINATION, id: "preferred" };
    const result = resolveAutoDestination(
      [nodeA, preferred],
      {
        nodeA: makeReadyToConnect("nodeA", 10_000_000),
        preferred: makeUnavailable("preferred"),
      },
      "preferred",
    );
    expect(result?.id).toBe("nodeA");
  });

  it("falls back to best healthy node when preferred is Unrecoverable", () => {
    const nodeA: Destination = { ...BASE_DESTINATION, id: "nodeA" };
    const preferred: Destination = { ...BASE_DESTINATION, id: "preferred" };
    const result = resolveAutoDestination(
      [nodeA, preferred],
      {
        nodeA: makeReadyToConnect("nodeA", 10_000_000),
        preferred: {
          destination: preferred,
          route_health: {
            state: { state: "Unrecoverable", reason: "NotAllowed" },
            last_error: null,
            checking_since: null,
            consecutive_failures: 0,
          },
        },
      },
      "preferred",
    );
    expect(result?.id).toBe("nodeA");
  });

  it("still returns a node when none have route health (no health-filter)", () => {
    const nodeA: Destination = { ...BASE_DESTINATION, id: "nodeA" };
    const result = resolveAutoDestination(
      [nodeA],
      { nodeA: makeUnavailable("nodeA") },
      null,
    );
    expect(result?.id).toBe("nodeA");
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

describe("sortByHealthScore", () => {
  it("places ReadyToConnect destinations before those with no route health", () => {
    const ready: Destination = { ...BASE_DESTINATION, id: "ready" };
    const notReady: Destination = { ...BASE_DESTINATION, id: "aaaaa" };
    const sorted = sortByHealthScore(
      [notReady, ready],
      {
        ready: makeReadyToConnect("ready"),
        aaaaa: makeUnavailable("aaaaa"),
      },
    );
    expect(sorted[0].id).toBe("ready");
    expect(sorted[1].id).toBe("aaaaa");
  });

  it("sorts ReadyToConnect destinations by latency ascending", () => {
    const slow: Destination = { ...BASE_DESTINATION, id: "slow" };
    const fast: Destination = { ...BASE_DESTINATION, id: "fast" };
    const sorted = sortByHealthScore(
      [slow, fast],
      {
        slow: makeReadyToConnect("slow", 100_000_000),
        fast: makeReadyToConnect("fast", 20_000_000),
      },
    );
    expect(sorted[0].id).toBe("fast");
    expect(sorted[1].id).toBe("slow");
  });

  it("places ready node before non-ready regardless of alphabetical order", () => {
    const ready: Destination = { ...BASE_DESTINATION, id: "zzzz" };
    const notReady: Destination = { ...BASE_DESTINATION, id: "aaaa" };
    const sorted = sortByHealthScore(
      [notReady, ready],
      {
        zzzz: makeReadyToConnect("zzzz"),
        aaaa: makeUnavailable("aaaa"),
      },
    );
    expect(sorted[0].id).toBe("zzzz");
    expect(sorted[1].id).toBe("aaaa");
  });

  it("sorts non-ready destinations alphabetically among themselves", () => {
    const zeta: Destination = { ...BASE_DESTINATION, id: "zeta" };
    const mu: Destination = { ...BASE_DESTINATION, id: "mu" };
    const sorted = sortByHealthScore(
      [zeta, mu],
      {
        zeta: makeUnavailable("zeta"),
        mu: makeUnavailable("mu"),
      },
    );
    expect(sorted[0].id).toBe("mu");
    expect(sorted[1].id).toBe("zeta");
  });

  it("places Unrecoverable destinations after ReadyToConnect", () => {
    const destA: Destination = { ...BASE_DESTINATION, id: "ready" };
    const destB: Destination = { ...BASE_DESTINATION, id: "unreachable" };

    const sorted = sortByHealthScore([destB, destA], {
      ready: makeReadyToConnect("ready"),
      unreachable: {
        destination: destB,
        route_health: {
          state: { state: "Unrecoverable", reason: "NotAllowed" },
          last_error: null,
          checking_since: null,
          consecutive_failures: 0,
        },
      },
    });

    expect(sorted[0].id).toBe("ready");
    expect(sorted[1].id).toBe("unreachable");
  });
});

describe("sortByCapacityAwareLatency", () => {
  it("sorts by raw latency when both have the same total slots", () => {
    // busy has 4 connected clients, so a malus would have pushed it behind idle
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
    ).toEqual(["busy", "idle"]);
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

  it("falls back to the label when neither has latency data", () => {
    expect(
      sortByCapacityAwareLatency({
        zeta: makeUnavailable("zeta"),
        alpha: makeUnavailable("alpha"),
      }),
    ).toEqual(["alpha", "zeta"]);
  });
});
