import { describe, expect, it } from "vitest";
import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import { sortByHealthScore } from "./destinations.ts";

const BASE_DESTINATION: Destination = {
  id: "a",
  meta: { location: "EU" },
  address: "0x1234",
  routing: { Hops: 1 },
};

const BASE_DEST_STATE: DestinationState = {
  destination: BASE_DESTINATION,
  route_health: null,
};

function makeReadyToConnect(id: string, pingNanos: number): DestinationState {
  return {
    destination: { ...BASE_DESTINATION, id },
    route_health: {
      state: {
        ReadyToConnect: {
          exit: {
            checked_at: { secs_since_epoch: 0, nanos_since_epoch: 0 },
            versions: { versions: [], latest: "" },
            ping_rtt: { secs: 0, nanos: pingNanos },
            health: {
              slots: { available: 5, connected: 2 },
              load_avg: { one: 0.5, five: 0.5, fifteen: 0.5, nproc: 4 },
            },
          },
        },
      },
      last_error: null,
      checking_since: null,
      consecutive_failures: 0,
    },
  };
}

describe("sortByHealthScore", () => {
  it("places ReadyToConnect destinations before those with no route_health", () => {
    const destA: Destination = { ...BASE_DESTINATION, id: "ready" };
    const destB: Destination = { ...BASE_DESTINATION, id: "no-health" };

    const sorted = sortByHealthScore([destB, destA], {
      ready: makeReadyToConnect("ready", 50_000_000),
      "no-health": { ...BASE_DEST_STATE, destination: destB },
    });

    expect(sorted[0].id).toBe("ready");
    expect(sorted[1].id).toBe("no-health");
  });

  it("places Unrecoverable destinations after ReadyToConnect", () => {
    const destA: Destination = { ...BASE_DESTINATION, id: "ready" };
    const destB: Destination = { ...BASE_DESTINATION, id: "unreachable" };

    const sorted = sortByHealthScore([destB, destA], {
      ready: makeReadyToConnect("ready", 50_000_000),
      unreachable: {
        destination: destB,
        route_health: {
          state: { Unrecoverable: { reason: "NotAllowed" } },
          last_error: null,
          checking_since: null,
          consecutive_failures: 0,
        },
      },
    });

    expect(sorted[0].id).toBe("ready");
    expect(sorted[1].id).toBe("unreachable");
  });

  it("sorts ReadyToConnect destinations by latency ascending", () => {
    const fast: Destination = { ...BASE_DESTINATION, id: "fast" };
    const slow: Destination = { ...BASE_DESTINATION, id: "slow" };

    const sorted = sortByHealthScore([slow, fast], {
      fast: makeReadyToConnect("fast", 20_000_000), // 20 ms
      slow: makeReadyToConnect("slow", 100_000_000), // 100 ms
    });

    expect(sorted[0].id).toBe("fast");
    expect(sorted[1].id).toBe("slow");
  });

  it("sorts non-ready destinations alphabetically by id", () => {
    const b: Destination = { ...BASE_DESTINATION, id: "bravo" };
    const a: Destination = { ...BASE_DESTINATION, id: "alpha" };

    const sorted = sortByHealthScore([b, a], {
      bravo: { ...BASE_DEST_STATE, destination: b },
      alpha: { ...BASE_DEST_STATE, destination: a },
    });

    expect(sorted[0].id).toBe("alpha");
    expect(sorted[1].id).toBe("bravo");
  });
});
