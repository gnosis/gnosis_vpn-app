import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import {
  createDestinationMode,
  type DestinationModeSettings,
  type ModeAppState,
  SELECTED_AUTO_REVERT_MS,
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

function connectedTo(
  id: string,
  destinations: Record<string, DestinationState>,
): ModeAppState {
  return {
    ...statusFor(destinations),
    connected: { destination_id: id, since: 0 },
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
  it("a backend connection state takes priority over the local mode", async () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };

    // auto has just armed a countdown toward the faster "usa"
    handle.applyStatusUpdate(statusFor(destinations));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });

    handle.applyStatusUpdate({
      ...statusFor(destinations),
      connecting: { destination_id: "uk", since: 0, phase: "Init" },
    });

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "live" });
    // the candidate never committed, so its speculative entry goes with it
    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.sequence).toEqual(["uk"]);

    // the disarmed countdown must not fire behind the live connection
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "live" });
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

describe("live mode — the backend's own connection state", () => {
  it("keeps a destination the backend no longer offers as the active entry", () => {
    const handle = setup();

    handle.applyStatusUpdate({
      ...statusFor({ uk: makeReadyToConnect("uk", 50) }),
      connected: { destination_id: "gone", since: 0 },
    });

    expect(handle.model.active).toBe("gone");
    expect(handle.model.entries["gone"]).toMatchObject({ origin: "auto" });
    expect(handle.model.sequence).toContain("gone");
  });

  it("follows a backend retarget, keeping the destination it switched away from", () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };

    handle.applyStatusUpdate(connectedTo("uk", destinations));
    handle.applyStatusUpdate(connectedTo("usa", destinations));

    expect(handle.model.active).toBe("usa");
    expect(handle.model.sequence).toEqual(["uk", "usa"]);
  });

  it("reuses an existing entry rather than minting a fresh render key for it", () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };

    handle.applyStatusUpdate(connectedTo("uk", destinations));
    handle.applyStatusUpdate(connectedTo("usa", destinations));
    const ukKey = handle.model.entries["uk"].key;

    handle.applyStatusUpdate(connectedTo("uk", destinations));

    expect(handle.model.entries["uk"].key).toBe(ukKey);
    expect(handle.model.sequence).toEqual(["uk", "usa"]);
  });

  it("spends the preferred location's one shot and drops the cold-start fallback", () => {
    const handle = setup({
      preferredLocation: "p",
      lastConnectedDestination: "old",
    });

    handle.applyStatusUpdate(connectedTo("p", { p: makeReadyToConnect("p") }));

    expect(handle.model.preferredLocation).toBeNull();
    expect(handle.model.lastConnectedDestination).toBeNull();
  });
});

describe("leaving live — selected, then the flat revert to auto", () => {
  it("parks on the last live destination, then falls back to auto after the deadline", async () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };

    handle.applyStatusUpdate(connectedTo("uk", destinations));
    handle.applyStatusUpdate(statusFor(destinations));

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });

    // a faster destination does not pull selected away before its deadline
    handle.applyStatusUpdate(statusFor(destinations));
    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode.mode).toBe("selected");

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.active).toBe("uk");
    expect(handle.model.sequence).toEqual(["uk"]);
  });

  it("holds selected for its full deadline even once the destination stops being routable", async () => {
    const handle = setup();

    handle.applyStatusUpdate(
      connectedTo("uk", { uk: makeReadyToConnect("uk", 50) }),
    );
    handle.applyStatusUpdate(statusFor({ uk: makeReadyToConnect("uk", 50) }));
    expect(handle.model.mode.mode).toBe("selected");

    const unroutableUk = statusFor({
      uk: makeUnavailable("uk"),
      usa: makeReadyToConnect("usa", 10),
    });
    handle.applyStatusUpdate(unroutableUk);

    // readiness does not shorten the window, and nothing is armed behind it
    expect(handle.model.mode.mode).toBe("selected");
    expect(handle.model.active).toBe("uk");

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);

    // the revert only swaps the mode — the auto pass runs on the next tick
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.active).toBe("uk");

    handle.applyStatusUpdate(unroutableUk);
    expect(handle.model.mode).toMatchObject({
      mode: "auto",
      pending: { candidateId: "usa" },
    });
  });

  it("falls through to auto immediately when the destination it parked on vanishes", () => {
    const handle = setup();

    handle.applyStatusUpdate(
      connectedTo("uk", { uk: makeReadyToConnect("uk", 50) }),
    );
    handle.applyStatusUpdate(statusFor({ uk: makeReadyToConnect("uk", 50) }));
    expect(handle.model.mode.mode).toBe("selected");

    handle.applyStatusUpdate(statusFor({ usa: makeReadyToConnect("usa", 10) }));

    expect(handle.model.mode.mode).toBe("auto");
    expect(handle.model.entries["uk"]).toBeUndefined();
    expect(handle.model.sequence).not.toContain("uk");
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

describe("user selection", () => {
  // committed strip of [uk, usa] with "de" armed as the next auto candidate
  async function stripWithPendingCandidate() {
    const handle = setup();
    const two = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    handle.applyStatusUpdate(statusFor({ uk: two.uk }));
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    handle.applyStatusUpdate(statusFor(two));
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    const three = { ...two, de: makeReadyToConnect("de", 5) };
    handle.applyStatusUpdate(statusFor(three));
    return { handle, three };
  }

  it("slider select enters selected, keeps the strip, and cancels the pending switch", async () => {
    const { handle } = await stripWithPendingCandidate();
    expect(handle.model.active).toBe("usa");

    handle.applyUserInput({ type: "setActiveEntry", id: "uk" });

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });
    expect(handle.model.sequence).toEqual(["uk", "usa", "de"]);

    // the cancelled countdown must not commit "de" behind the selection
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("uk");
  });

  it("holds the selection against a better destination, then reverts to auto", async () => {
    const { handle, three } = await stripWithPendingCandidate();
    handle.applyUserInput({ type: "setActiveEntry", id: "uk" });

    handle.applyStatusUpdate(statusFor(three));
    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode.mode).toBe("selected");

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.active).toBe("uk");

    handle.applyStatusUpdate(statusFor(three));
    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "de" } });
  });

  it("list pick takes the outgoing card's slot, keeping the strip's order and length", async () => {
    const { handle } = await stripWithPendingCandidate();
    const nextKey = handle.model.nextKey;

    handle.applyUserInput({ type: "pickDestination", id: "fr" });

    expect(handle.model.sequence).toEqual(["uk", "fr", "de"]);
    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.entries["fr"]).toEqual({
      origin: "user",
      key: nextKey,
    });
    expect(handle.model.nextKey).toBe(nextKey + 1);
    expect(handle.model.active).toBe("fr");
    expect(handle.model.mode.mode).toBe("selected");
  });

  it("list pick is a no-op before a first card exists", () => {
    const handle = setup();

    handle.applyUserInput({ type: "pickDestination", id: "uk" });

    expect(handle.model.active).toBeNull();
    expect(handle.model.sequence).toEqual([]);
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });

  it("spends the preferred location's one shot when it is picked", async () => {
    const handle = setup({ preferredLocation: "p" });

    handle.applyStatusUpdate(statusFor({
      p: makeUnavailable("p"),
      uk: makeReadyToConnect("uk", 50),
    }));
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.active).toBe("uk");
    expect(handle.model.preferredLocation).toBe("p");

    handle.applyUserInput({ type: "pickDestination", id: "p" });

    expect(handle.model.active).toBe("p");
    expect(handle.model.sequence).toEqual(["p"]);
    expect(handle.model.preferredLocation).toBeNull();
  });
});
