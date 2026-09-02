import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import {
  createDestinationMode,
  type DestinationModeSettings,
  type ModeAppState,
  SWITCH_COUNTDOWN_MS,
  SWITCH_CROSSOVER_MS,
} from "./destinationMode.ts";

const SETTLE_MS = SWITCH_COUNTDOWN_MS + SWITCH_CROSSOVER_MS;

const BASE_DESTINATION: Destination = {
  id: "a",
  meta: { location: "EU" },
  address: "0x1234",
  routing: 1,
};

// same slots for every fixture, so the capacity-aware sort reduces to plain ping_rtt
function makeReadyToConnect(id: string, pingMs = 50): DestinationState {
  return {
    destination: { ...BASE_DESTINATION, id },
    route_health: {
      state: {
        state: "ReadyToConnect",
        exit: {
          checked_at: 0,
          versions: { versions: [], latest: "" },
          ping_rtt: pingMs,
          health: {
            slots: { available: 5, connected: 0 },
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
  return { destination: { ...BASE_DESTINATION, id }, route_health: null };
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
  };
}

function setup(settings: Partial<DestinationModeSettings> = {}) {
  return createDestinationMode({
    preferredLocation: null,
    lastConnectedDestination: null,
    ...settings,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("preferred location — one-shot promotion (auto mode)", () => {
  it("cold start: a routable preferred location becomes active immediately and spends the shot", () => {
    const handle = setup({ preferredLocation: "p" });

    handle.applyStatusUpdate(statusFor({
      p: makeReadyToConnect("p", 50),
      fast: makeReadyToConnect("fast", 10),
    }));

    expect(handle.model.active).toBe("p");
    expect(handle.model.preferredLocation).toBeNull();
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });

  it("cold start: an unready preferred location does not spend the shot and falls through to bestDestination", () => {
    const handle = setup({ preferredLocation: "p" });

    handle.applyStatusUpdate(statusFor({
      p: makeUnavailable("p"),
      fast: makeReadyToConnect("fast", 10),
    }));

    expect(handle.model.active).toBeNull();
    expect(handle.model.preferredLocation).toBe("p");
    expect(handle.model.mode).toMatchObject({
      mode: "auto",
      pending: { candidateId: "fast" },
    });
  });

  it("steady state: preferred becoming routable hijacks the active slot, committing after the countdown and spending the shot", async () => {
    const handle = setup({ preferredLocation: "p" });

    // cold start, nothing else applies — "slow" becomes active immediately
    handle.applyStatusUpdate(
      statusFor({ slow: makeReadyToConnect("slow", 100) }),
    );
    expect(handle.model.active).toBeNull();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("slow");

    // preferred shows up ready — takes over even though nothing else forces a switch
    handle.applyStatusUpdate(statusFor({
      slow: makeReadyToConnect("slow", 100),
      p: makeReadyToConnect("p", 50),
    }));
    expect(handle.model.mode).toMatchObject({
      mode: "auto",
      pending: { candidateId: "p" },
    });

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("p");
    expect(handle.model.preferredLocation).toBeNull();
  });

  it("steady state: a lower-latency destination does not pre-empt a pending preferred location while it stays routable", async () => {
    const handle = setup({ preferredLocation: "p" });

    handle.applyStatusUpdate(
      statusFor({ slow: makeReadyToConnect("slow", 100) }),
    );
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("slow");

    handle.applyStatusUpdate(statusFor({
      slow: makeReadyToConnect("slow", 100),
      p: makeReadyToConnect("p", 50),
    }));
    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "p" } });

    // a much better destination shows up mid-countdown — must not steal the pending slot
    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS / 2);
    handle.applyStatusUpdate(statusFor({
      slow: makeReadyToConnect("slow", 100),
      p: makeReadyToConnect("p", 50),
      fastest: makeReadyToConnect("fastest", 1),
    }));
    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "p" } });

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("p");
  });

  it("steady state: preferred dropping out of routability before commit falls back to bestDestination, leaving the shot unspent", async () => {
    const handle = setup({ preferredLocation: "p" });

    handle.applyStatusUpdate(
      statusFor({ slow: makeReadyToConnect("slow", 100) }),
    );
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("slow");

    handle.applyStatusUpdate(statusFor({
      slow: makeReadyToConnect("slow", 100),
      p: makeReadyToConnect("p", 50),
    }));
    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "p" } });

    // preferred goes unready mid-countdown — falls back, but the shot stays unspent
    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS / 2);
    handle.applyStatusUpdate(statusFor({
      slow: makeReadyToConnect("slow", 100),
      p: makeUnavailable("p"),
      fast: makeReadyToConnect("fast", 10),
    }));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "fast" },
    });
    expect(handle.model.preferredLocation).toBe("p");

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("fast");
    expect(handle.model.preferredLocation).toBe("p");

    // becomes routable again later — still gets its one shot
    handle.applyStatusUpdate(statusFor({
      fast: makeReadyToConnect("fast", 10),
      p: makeReadyToConnect("p", 50),
    }));
    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "p" } });
  });

  it("hijacks an unrelated in-flight pending candidate immediately, restarting the countdown and dropping the displaced entry", async () => {
    const handle = setup({ preferredLocation: "p" });

    handle.applyStatusUpdate(
      statusFor({ slow: makeReadyToConnect("slow", 100) }),
    );
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("slow");

    // "fast" becomes pending on plain latency grounds — no preferred yet
    handle.applyStatusUpdate(statusFor({
      slow: makeReadyToConnect("slow", 100),
      fast: makeReadyToConnect("fast", 10),
    }));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "fast" },
    });
    const fastCountdownEndsAt =
      (handle.model.mode as { pending: { countdownEndsAt: number } })
        .pending.countdownEndsAt;

    // most of "fast"'s countdown elapses, then preferred shows up ready
    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS - 100);
    handle.applyStatusUpdate(statusFor({
      slow: makeReadyToConnect("slow", 100),
      fast: makeReadyToConnect("fast", 10),
      p: makeReadyToConnect("p", 50),
    }));

    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "p" } });
    const preferredCountdownEndsAt =
      (handle.model.mode as { pending: { countdownEndsAt: number } })
        .pending.countdownEndsAt;
    expect(preferredCountdownEndsAt).toBeGreaterThan(fastCountdownEndsAt);
    expect(handle.model.entries["fast"]).toBeUndefined();
    expect(handle.model.entries["p"]).toBeDefined();

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("p");
  });

  it("does not re-offer preferred once the shot has been spent", async () => {
    const handle = setup({ preferredLocation: "p" });

    handle.applyStatusUpdate(statusFor({ p: makeReadyToConnect("p", 50) }));
    expect(handle.model.active).toBe("p");
    expect(handle.model.preferredLocation).toBeNull();

    // p later drops and a faster destination becomes active
    handle.applyStatusUpdate(
      statusFor({ fast: makeReadyToConnect("fast", 10) }),
    );
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("fast");

    // p becomes routable again — shot already spent, so ordinary ranking applies
    handle.applyStatusUpdate(statusFor({
      fast: makeReadyToConnect("fast", 10),
      p: makeReadyToConnect("p", 50),
    }));
    expect(handle.model.active).toBe("fast");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });
});

describe("mode derived from status", () => {
  it("a backend connection state takes priority over the local mode", () => {
    const handle = setup();
    const destinations = { uk: makeReadyToConnect("uk", 50) };

    expect(() =>
      handle.applyStatusUpdate({
        ...statusFor(destinations),
        connecting: { destination_id: "uk", since: 0, phase: "Init" },
      })
    ).toThrow("not implemented");
  });

  it("prunes entries the backend no longer offers", async () => {
    const handle = setup();

    handle.applyStatusUpdate(statusFor({
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    }));
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("usa");

    handle.applyStatusUpdate(statusFor({ uk: makeReadyToConnect("uk", 50) }));

    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.sequence).not.toContain("usa");
  });
});

describe("pending candidate cleanup (auto mode)", () => {
  it("drops the pending candidate's entry when the active destination becomes best again before commit", async () => {
    const handle = setup();

    handle.applyStatusUpdate(statusFor({ uk: makeReadyToConnect("uk", 50) }));
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("uk");

    // "usa" overtakes on latency and becomes pending
    handle.applyStatusUpdate(statusFor({
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    }));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });
    expect(handle.model.entries["usa"]).toBeDefined();

    // before commit, "uk" (already active) becomes best again
    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS / 2);
    handle.applyStatusUpdate(statusFor({
      uk: makeReadyToConnect("uk", 5),
      usa: makeReadyToConnect("usa", 10),
    }));

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.active).toBe("uk");
    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.sequence).not.toContain("usa");
  });

  it("drops the pending candidate's entry when health data briefly disappears (bestDestination undefined, but still available)", async () => {
    const handle = setup();

    handle.applyStatusUpdate(statusFor({ uk: makeReadyToConnect("uk", 50) }));
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("uk");

    handle.applyStatusUpdate(statusFor({
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    }));
    expect(handle.model.entries["usa"]).toBeDefined();

    // destinations are still known/available, but the health-data record is
    // empty this tick — sortByCapacityAwareLatency([]) has no [0], so
    // bestDestination is undefined even though "usa" isn't evicted by the
    // availableIds filter.
    handle.applyStatusUpdate({
      availableDestinations: [
        makeReadyToConnect("uk", 50).destination,
        makeReadyToConnect("usa", 10).destination,
      ],
      destinations: {},
      connected: null,
      connecting: null,
      reconnecting: null,
    });

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.sequence).not.toContain("usa");
  });
});

describe("lastConnectedDestination — unchanged, cold-start-only fallback", () => {
  it("is tried once at cold start regardless of readiness outcome, even when not ready", () => {
    const handle = setup({ lastConnectedDestination: "last" });

    handle.applyStatusUpdate(statusFor({
      last: makeUnavailable("last"),
      fast: makeReadyToConnect("fast", 10),
    }));

    // claims the cold-start tick despite failing readiness — no active, no pending arm
    expect(handle.model.active).toBeNull();
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.lastConnectedDestination).toBeNull();
  });

  it("becomes active immediately at cold start when ready", () => {
    const handle = setup({ lastConnectedDestination: "last" });

    handle.applyStatusUpdate(
      statusFor({ last: makeReadyToConnect("last", 50) }),
    );

    expect(handle.model.active).toBe("last");
    expect(handle.model.lastConnectedDestination).toBeNull();
  });
});
