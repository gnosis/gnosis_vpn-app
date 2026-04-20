import { describe, expect, it } from "vitest";
import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import { getHealthScore, sortByHealthScore } from "./exitHealth.ts";

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

const HEALTHY_DEST_STATE: DestinationState = {
  destination: BASE_DESTINATION,
  route_health: {
    state: {
      ReadyToConnect: {
        exit: {
          checked_at: { secs_since_epoch: 0, nanos_since_epoch: 0 },
          versions: { versions: [], latest: "" },
          ping_rtt: { secs: 0, nanos: 50_000_000 },
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

describe("getHealthScore", () => {
  it("returns 0 when route_health is null", () => {
    expect(getHealthScore(BASE_DEST_STATE)).toBe(0);
  });

  it("scores null route_health below a healthy route", () => {
    const nullScore = getHealthScore(BASE_DEST_STATE);
    const healthyScore = getHealthScore(HEALTHY_DEST_STATE);
    expect(healthyScore).toBeGreaterThan(nullScore);
  });

  it("scores Unrecoverable below null route_health", () => {
    const unrecoverableDs: DestinationState = {
      ...BASE_DEST_STATE,
      route_health: {
        state: { Unrecoverable: { reason: "NotAllowed" } },
        last_error: null,
        checking_since: null,
        consecutive_failures: 0,
      },
    };
    expect(getHealthScore(unrecoverableDs)).toBeLessThan(
      getHealthScore(BASE_DEST_STATE),
    );
  });
});

describe("sortByHealthScore", () => {
  it("places destinations with null route_health after healthy ones", () => {
    const destA: Destination = { ...BASE_DESTINATION, id: "healthy" };
    const destB: Destination = { ...BASE_DESTINATION, id: "no-health" };

    const sorted = sortByHealthScore([destB, destA], {
      healthy: { ...HEALTHY_DEST_STATE, destination: destA },
      "no-health": { ...BASE_DEST_STATE, destination: destB },
    });

    expect(sorted[0].id).toBe("healthy");
    expect(sorted[1].id).toBe("no-health");
  });
});
