import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import {
  createDestinationMode,
  type DestinationMode,
  type DestinationModeHandle,
  type DestinationModeSettings,
  effectiveActive,
  type ModeAppState,
  orderedEntries,
  SELECTED_AUTO_REVERT_MS,
  STATUS_POLL_MS,
  SWITCH_COUNTDOWN_MS,
  SWITCH_CROSSOVER_MS,
} from "./destinationMode.ts";

// Derived from destinationMode.md — where spec and implementation disagree, the spec wins and the case is expected to fail.

const SETTLE_MS = SWITCH_COUNTDOWN_MS + SWITCH_CROSSOVER_MS;

const BASE_DESTINATION: Destination = {
  id: "a",
  meta: { location: "EU" },
  address: "0x1234",
  routing: 1,
};

function makeReadyToConnect(
  id: string,
  pingMs = 50,
  slots = { available: 5, connected: 0 },
): DestinationState {
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

/** ReadyToConnect but with no free slot — not ready, per the spec's capacity rule. */
function makeFull(id: string, pingMs = 50): DestinationState {
  return makeReadyToConnect(id, pingMs, { available: 0, connected: 5 });
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

function connectingTo(
  id: string,
  destinations: Record<string, DestinationState>,
): ModeAppState {
  return {
    ...statusFor(destinations),
    connecting: { destination_id: id, since: 0, phase: "Init" },
  };
}

function setup(settings: Partial<DestinationModeSettings> = {}) {
  return createDestinationMode({
    preferredLocation: null,
    lastConnectedDestination: null,
    ...settings,
  });
}

/** The eight invariants from destinationMode.md — they must hold after every transition. */
function expectInvariants(model: DestinationMode): void {
  const { entries, sequence, active, mode } = model;
  const pending = mode.mode === "auto" ? mode.pending : null;

  expect(new Set(sequence).size, "1: sequence has no duplicates")
    .toBe(sequence.length);
  expect([...sequence].sort(), "2: sequence and entries hold the same ids")
    .toEqual(Object.keys(entries).sort());
  if (active !== null) {
    expect(entries[active], `3: active ${active} is an entry`).toBeDefined();
  }
  if (pending !== null) {
    expect(entries[pending.candidateId], "4: candidate is an entry")
      .toBeDefined();
    expect(pending.candidateId, "4: candidate is not active").not.toBe(active);
  }
  if (mode.mode === "selected") {
    expect(active, "5: selected implies an active entry").not.toBeNull();
  }
  for (const [id, entry] of Object.entries(entries)) {
    const justified = entry.wasActive || id === pending?.candidateId;
    expect(justified, `6: entry ${id} is history or the candidate`).toBe(true);
  }
  const keys = Object.values(entries).map((e) => e.key);
  expect(new Set(keys).size, "7: render keys are unique").toBe(keys.length);
  expect(Math.max(-1, ...keys), "7: nextKey is beyond every key issued")
    .toBeLessThan(model.nextKey);
  if (pending !== null) {
    expect(model.listOpen || model.dragging, "8: no pending while suspended")
      .toBe(false);
    expect(active, "9: nothing to switch away from without an active entry")
      .not.toBeNull();
  }
}

/** Applies a status update and re-checks the invariants, the way every case should. */
function step(handle: DestinationModeHandle, status: ModeAppState): void {
  handle.applyStatusUpdate(status);
  expectInvariants(handle.model);
}

const UK_USA = {
  uk: makeReadyToConnect("uk", 50),
  usa: makeReadyToConnect("usa", 10),
};

/** Strip [uk, usa] with usa active — the only route to a card that is history rather than a candidate. */
function stripWithHistory(handle: DestinationModeHandle): void {
  step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
  step(handle, statusFor(UK_USA));
  vi.advanceTimersByTime(SETTLE_MS);
  expectInvariants(handle.model);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("effectiveActive — the one reader of what we are on", () => {
  it("stays on the active card until the candidate's settleAt", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.active).toBe("uk");
    expect(effectiveActive(handle.model, Date.now())).toBe("uk");
    expect(effectiveActive(handle.model, Date.now() + SWITCH_COUNTDOWN_MS))
      .toBe("uk");
  });

  it("reports the candidate from settleAt, before the commit timer has run", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    const settleAt = Date.now() + SETTLE_MS;
    expect(effectiveActive(handle.model, settleAt)).toBe("usa");
    expect(handle.model.active, "the store has not committed yet").toBe("uk");
  });

  it("falls back to active for a pending gone stale by more than one poll", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    const wayPastSettle = Date.now() + SETTLE_MS + STATUS_POLL_MS + 1;
    expect(effectiveActive(handle.model, wayPastSettle)).toBe("uk");
  });
});

describe("statusUpdate — baseline", () => {
  it("prunes entries, sequence and active to what the backend still offers", () => {
    const handle = setup();
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    vi.advanceTimersByTime(SETTLE_MS);
    expect(handle.model.active).toBe("usa");

    step(handle, statusFor({ fr: makeReadyToConnect("fr", 30) }));

    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.entries["uk"]).toBeUndefined();
    expect(handle.model.sequence).not.toContain("usa");
  });
});

describe("statusUpdate — live", () => {
  it("takes priority over an armed countdown and sweeps the candidate away", async () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(handle, statusFor(destinations));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });

    step(handle, connectingTo("uk", destinations));

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "live" });
    expect(handle.model.entries["usa"], "the candidate never committed")
      .toBeUndefined();

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.mode).toEqual({ mode: "live" });
  });

  it("mints the live entry when the prune removed it", () => {
    const handle = setup();

    step(handle, connectedTo("gone", { uk: makeReadyToConnect("uk", 50) }));

    expect(handle.model.active).toBe("gone");
    expect(handle.model.entries["gone"]).toMatchObject({ wasActive: true });
  });

  it("closes an open list, since we did not start this connection from it", () => {
    const handle = setup();
    const destinations = { uk: makeReadyToConnect("uk", 50) };
    step(handle, statusFor(destinations));

    handle.applyUserInput({ type: "listOpened" });
    expect(handle.model.listOpen).toBe(true);

    step(handle, connectedTo("uk", destinations));

    expect(handle.model.listOpen).toBe(false);
  });

  it("retargets active when the backend switches destination under us", () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    step(handle, connectedTo("uk", destinations));
    step(handle, connectedTo("usa", destinations));

    expect(handle.model.active).toBe("usa");
    expect(handle.model.entries["uk"], "where we came from stays as history")
      .toBeDefined();
  });
});

describe("statusUpdate — leaving live", () => {
  it("parks on the destination we were connected to, then reverts to auto", async () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    step(handle, connectedTo("uk", destinations));

    step(handle, statusFor(destinations));

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({ mode: "selected" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    step(handle, statusFor(destinations));
    expect(handle.model.mode.mode).toBe("auto");
  });

  it("does not close the list", () => {
    const handle = setup();
    const destinations = { uk: makeReadyToConnect("uk", 50) };
    step(handle, connectedTo("uk", destinations));
    handle.applyUserInput({ type: "listOpened" });

    step(handle, statusFor(destinations));

    expect(handle.model.listOpen).toBe(true);
  });
});

describe("statusUpdate — suspension", () => {
  it("freezes the mode while the list is open", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    handle.applyUserInput({ type: "listOpened" });

    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.active, "a suspended model does not switch").toBe("uk");
    expect(handle.model.entries["usa"], "nor mint a candidate card")
      .toBeUndefined();
  });

  it("freezes the mode while dragging", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    handle.applyUserInput({ type: "dragStarted" });

    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.mode).toMatchObject({ mode: "selected" });
    expect(handle.model.dragging).toBe(true);
  });

  it("still applies the baseline prune while suspended", () => {
    const handle = setup();
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    vi.advanceTimersByTime(SETTLE_MS);
    handle.applyUserInput({ type: "listOpened" });

    step(handle, statusFor({ usa: makeReadyToConnect("usa", 10) }));

    expect(handle.model.entries["uk"]).toBeUndefined();
  });

  it("ends the suspension and cold starts when the active is pruned away", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    handle.applyUserInput({ type: "listOpened" });

    step(handle, statusFor({ fr: makeReadyToConnect("fr", 30) }));

    expect(handle.model.listOpen, "a list over a vanished card must close")
      .toBe(false);
    expect(handle.model.active).toBe("fr");
  });
});

describe("statusUpdate — selected", () => {
  it("holds the selection even once the destination stops being ready", () => {
    const handle = setup();
    stripWithHistory(handle);
    handle.applyUserInput({ type: "slideCommitted", id: "uk" });

    step(
      handle,
      statusFor({
        uk: makeUnavailable("uk"),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({ mode: "selected" });
  });

  it("reverts on the deadline via the status update, not the timer", () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    step(handle, statusFor(destinations));
    vi.advanceTimersByTime(SETTLE_MS);
    handle.applyUserInput({ type: "slideCommitted", id: "uk" });

    // the clock passes the deadline without the revert timer being allowed to run
    vi.setSystemTime(Date.now() + SELECTED_AUTO_REVERT_MS + 1);
    step(handle, statusFor(destinations));

    expect(handle.model.mode.mode).toBe("auto");
  });
});

describe("auto — arming", () => {
  it("arms a countdown toward a better destination and appends its card", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));

    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.mode).toMatchObject({
      mode: "auto",
      pending: { candidateId: "usa" },
    });
    expect(handle.model.sequence).toEqual(["uk", "usa"]);
    expect(handle.model.entries["usa"]).toMatchObject({ wasActive: false });
  });

  it("keeps a candidate that is already history in its slot", () => {
    const handle = setup();
    stripWithHistory(handle);
    expect(handle.model.sequence).toEqual(["uk", "usa"]);
    expect(handle.model.active).toBe("usa");

    // uk becomes best again — it is history, so it must not be re-appended
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 10),
        usa: makeReadyToConnect("usa", 50),
      }),
    );

    expect(handle.model.sequence).toEqual(["uk", "usa"]);
    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "uk" } });
  });

  // The sort already sinks full destinations, so isolating the capacity rule needs every destination full.
  it("never arms toward a destination with no free slot", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));

    step(
      handle,
      statusFor({ uk: makeFull("uk", 50), usa: makeFull("usa", 10) }),
    );

    expect(handle.model.active, "we stay put rather than chase a full node")
      .toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });

  it("commits at settleAt, staying in auto", async () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(handle.model.active).toBe("usa");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.entries["usa"], "a commit makes the card history")
      .toMatchObject({ wasActive: true });
    expectInvariants(handle.model);
  });

  it("commits from the clock when the timer was never allowed to fire", () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(handle, statusFor(destinations));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });

    vi.setSystemTime(Date.now() + SETTLE_MS);
    step(handle, statusFor(destinations));

    expect(handle.model.active).toBe("usa");
  });

  it("discards a pending slept past by more than one poll instead of committing it", () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(handle, statusFor(destinations));

    vi.setSystemTime(Date.now() + SETTLE_MS + STATUS_POLL_MS + 1);
    step(handle, statusFor(destinations));

    // re-derived from fresh data rather than committed blind
    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });
  });
});

describe("auto — retargeting and the freeze", () => {
  it("retargets a pending without restarting its countdown", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    const armed = handle.model.mode;
    const deadlines = armed.mode === "auto" && armed.pending
      ? { ...armed.pending }
      : null;

    vi.setSystemTime(Date.now() + 1_000);
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 40),
        fr: makeReadyToConnect("fr", 5),
      }),
    );

    expect(handle.model.mode).toMatchObject({
      pending: {
        candidateId: "fr",
        countdownEndsAt: deadlines?.countdownEndsAt,
        settleAt: deadlines?.settleAt,
      },
    });
  });

  it("sweeps the displaced candidate's card away on a retarget", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 40),
        fr: makeReadyToConnect("fr", 5),
      }),
    );

    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.sequence).toEqual(["uk", "fr"]);
  });

  it("freezes the target once the countdown has elapsed", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    vi.setSystemTime(Date.now() + SWITCH_COUNTDOWN_MS + 1);
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 40),
        fr: makeReadyToConnect("fr", 5),
      }),
    );

    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });
  });
});

describe("auto — disarming and the sweep", () => {
  it("drops the candidate's card when the active becomes best again", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    expect(handle.model.sequence).toEqual(["uk", "usa"]);

    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 10),
        usa: makeReadyToConnect("usa", 50),
      }),
    );

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.sequence).toEqual(["uk"]);
  });

  it("keeps a candidate's card when it was already history", () => {
    const handle = setup();
    stripWithHistory(handle);

    // uk becomes the candidate, then loses it again
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 10),
        usa: makeReadyToConnect("usa", 50),
      }),
    );
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.entries["uk"], "history is not swept").toBeDefined();
    expect(handle.model.sequence).toEqual(["uk", "usa"]);
  });

  it("disarms when health data disappears entirely", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    step(
      handle,
      statusFor({ uk: makeUnavailable("uk"), usa: makeUnavailable("usa") }),
    );

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.entries["usa"]).toBeUndefined();
  });
});

describe("cold start", () => {
  it("starts on lastConnected regardless of readiness, then drops the field", () => {
    const handle = setup({ lastConnectedDestination: "uk" });

    step(
      handle,
      statusFor({
        uk: makeUnavailable("uk"),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.lastConnectedDestination).toBeNull();
  });

  it("outranks a ready preferred location", () => {
    const handle = setup({
      lastConnectedDestination: "uk",
      preferredLocation: "fr",
    });

    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        fr: makeReadyToConnect("fr", 30),
      }),
    );

    expect(handle.model.active).toBe("uk");
    expect(
      handle.model.preferredLocation,
      "unspent, so it arrives by countdown",
    )
      .toBe("fr");
  });

  it("falls through to the best candidate when lastConnected is not offered", () => {
    const handle = setup({ lastConnectedDestination: "gone" });

    step(handle, statusFor({ usa: makeReadyToConnect("usa", 10) }));

    expect(handle.model.active).toBe("usa");
    expect(handle.model.lastConnectedDestination).toBeNull();
  });

  it("is consulted once per launch, not again mid-session", () => {
    const handle = setup({ lastConnectedDestination: "uk" });
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    expect(handle.model.active).toBe("uk");

    // uk vanishes, forcing a mid-session cold start
    step(handle, statusFor({ usa: makeReadyToConnect("usa", 10) }));
    expect(handle.model.active).toBe("usa");

    // and coming back does not reinstate it
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 5),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    expect(handle.model.active).toBe("usa");
  });

  it("promotes an unspent ready preferred location immediately, spending the shot", () => {
    const handle = setup({ preferredLocation: "fr" });

    step(
      handle,
      statusFor({
        fr: makeReadyToConnect("fr", 90),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.active).toBe("fr");
    expect(handle.model.preferredLocation).toBeNull();
    expect(handle.model.mode, "a promotion never arms a countdown")
      .toEqual({ mode: "auto", pending: null });
  });

  it("promotes the sort head when there is nothing else to go on", () => {
    const handle = setup();

    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    expect(handle.model.active).toBe("usa");
    expect(handle.model.entries["usa"]).toMatchObject({ wasActive: true });
  });
});

describe("preferred location", () => {
  it("becomes the candidate under the ordinary countdown once routable", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 10),
        fr: makeUnavailable("fr"),
      }),
    );
    expect(handle.model.active).toBe("uk");

    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 10),
        fr: makeReadyToConnect("fr", 90),
      }),
    );

    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "fr" } });
  });

  it("does not restart a countdown it takes over", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
        fr: makeUnavailable("fr"),
      }),
    );
    const armed = handle.model.mode;
    const settleAt = armed.mode === "auto" ? armed.pending?.settleAt : null;

    vi.setSystemTime(Date.now() + 1_000);
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
        fr: makeReadyToConnect("fr", 90),
      }),
    );

    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "fr", settleAt },
    });
  });

  it("is spent only once it becomes active", async () => {
    const handle = setup({ preferredLocation: "fr" });
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        fr: makeReadyToConnect("fr", 90),
      }),
    );
    expect(handle.model.preferredLocation).toBe("fr");

    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(handle.model.active).toBe("fr");
    expect(handle.model.preferredLocation).toBeNull();
  });

  it("keeps its shot when it stops being ready before committing", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        fr: makeReadyToConnect("fr", 90),
      }),
    );

    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        fr: makeUnavailable("fr"),
      }),
    );

    expect(handle.model.preferredLocation).toBe("fr");
  });

  it("is not spent by the user choosing something else", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
        fr: makeUnavailable("fr"),
      }),
    );

    handle.applyUserInput({ type: "listOpened" });
    handle.applyUserInput({ type: "listClosed", picked: "uk" });

    expect(
      handle.model.active,
      "the pick has to land for this to mean anything",
    )
      .toBe("uk");
    expect(handle.model.preferredLocation).toBe("fr");
  });

  it("needs free slots, not just a ready state", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));

    step(
      handle,
      statusFor({ uk: makeReadyToConnect("uk", 50), fr: makeFull("fr", 90) }),
    );

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.preferredLocation).toBe("fr");
  });
});

describe("listOpened", () => {
  it("clears an armed pending and sweeps its card", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    handle.applyUserInput({ type: "listOpened" });

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.entries["usa"]).toBeUndefined();
    expect(handle.model.listOpen).toBe(true);
    expectInvariants(handle.model);
  });

  it("stops the selected deadline rather than letting it run out", () => {
    const handle = setup();
    stripWithHistory(handle);
    handle.applyUserInput({ type: "slideCommitted", id: "uk" });

    handle.applyUserInput({ type: "listOpened" });

    expect(handle.model.mode).toEqual({ mode: "selected", autoRevertAt: null });
  });

  it("keeps a history card that happened to be the candidate", () => {
    const handle = setup();
    stripWithHistory(handle);
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 10),
        usa: makeReadyToConnect("usa", 50),
      }),
    );

    handle.applyUserInput({ type: "listOpened" });

    expect(handle.model.entries["uk"]).toBeDefined();
    expect(handle.model.sequence).toEqual(["uk", "usa"]);
  });
});

describe("listClosed — cancelled", () => {
  it("resumes auto from a clean slate", () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(handle, statusFor(destinations));
    handle.applyUserInput({ type: "listOpened" });

    handle.applyUserInput({ type: "listClosed", picked: null });

    expect(handle.model.listOpen).toBe(false);
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });

    step(handle, statusFor(destinations));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });
  });

  it("restores a selection with a fresh deadline", () => {
    const handle = setup();
    stripWithHistory(handle);
    handle.applyUserInput({ type: "slideCommitted", id: "uk" });
    handle.applyUserInput({ type: "listOpened" });

    vi.setSystemTime(Date.now() + SELECTED_AUTO_REVERT_MS * 2);
    handle.applyUserInput({ type: "listClosed", picked: null });

    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });
  });

  it("leaves live alone", () => {
    const handle = setup();
    const destinations = { uk: makeReadyToConnect("uk", 50) };
    step(handle, connectedTo("uk", destinations));
    handle.applyUserInput({ type: "listOpened" });

    handle.applyUserInput({ type: "listClosed", picked: null });

    expect(handle.model.mode).toEqual({ mode: "live" });
  });
});

describe("listClosed — picked", () => {
  it("takes the outgoing card's slot and keeps the sequence unique", async () => {
    const handle = setup();
    step(handle, statusFor({ a: makeReadyToConnect("a", 50) }));
    step(
      handle,
      statusFor({
        a: makeReadyToConnect("a", 50),
        b: makeReadyToConnect("b", 10),
      }),
    );
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(handle.model.sequence).toEqual(["a", "b"]);
    expect(handle.model.active).toBe("b");

    handle.applyUserInput({ type: "listOpened" });
    handle.applyUserInput({ type: "listClosed", picked: "c" });

    // c takes b's slot, so a keeps its place and the strip does not grow
    expect(handle.model.active).toBe("c");
    expect(handle.model.sequence).toEqual(["a", "c"]);
    expectInvariants(handle.model);
  });

  it("removes the duplicate copy when picking a card already in the strip", () => {
    const handle = setup();
    stripWithHistory(handle);
    expect(handle.model.sequence).toEqual(["uk", "usa"]);

    handle.applyUserInput({ type: "listOpened" });
    handle.applyUserInput({ type: "listClosed", picked: "uk" });

    expect(handle.model.sequence).toEqual(["uk"]);
    expect(handle.model.active).toBe("uk");
  });

  it("mounts the picked card fresh rather than sliding the old one", () => {
    const handle = setup();
    stripWithHistory(handle);
    const oldKey = handle.model.entries["uk"].key;

    handle.applyUserInput({ type: "listOpened" });
    handle.applyUserInput({ type: "listClosed", picked: "uk" });

    expect(handle.model.entries["uk"].key).not.toBe(oldKey);
  });

  it("enters selected when the pick did not connect", () => {
    const handle = setup();
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    handle.applyUserInput({ type: "listOpened" });
    handle.applyUserInput({ type: "listClosed", picked: "uk" });

    expect(handle.model.mode).toMatchObject({ mode: "selected" });
  });

  it("stays live when the pick connected on the way out", () => {
    const handle = setup();
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );
    handle.applyUserInput({ type: "listOpened" });
    // the list issues connect before it closes
    handle.applyUserInput({ type: "connectIssued", id: "usa" });
    handle.applyUserInput({ type: "listClosed", picked: "usa" });

    expect(handle.model.mode).toEqual({ mode: "live" });
    expect(handle.model.active).toBe("usa");
  });

  it("treats picking the already-active card as a cancel with a fresh deadline", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    const seqBefore = [...handle.model.sequence];

    handle.applyUserInput({ type: "listOpened" });
    handle.applyUserInput({ type: "listClosed", picked: "uk" });

    expect(handle.model.sequence).toEqual(seqBefore);
    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });
  });

  it("mints and activates a pick made before any card exists", () => {
    const handle = setup();

    handle.applyUserInput({ type: "listOpened" });
    handle.applyUserInput({ type: "listClosed", picked: "uk" });

    expect(handle.model.active).toBe("uk");
    expect(handle.model.sequence).toEqual(["uk"]);
    expectInvariants(handle.model);
  });
});

describe("dragStarted and slideCommitted", () => {
  it("selects from the first movement and stops the clock", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    handle.applyUserInput({ type: "dragStarted" });

    expect(handle.model.dragging).toBe(true);
    expect(handle.model.mode).toEqual({ mode: "selected", autoRevertAt: null });
    expect(handle.model.entries["usa"], "the candidate is swept")
      .toBeUndefined();
    expectInvariants(handle.model);
  });

  it("settles onto a card with a fresh deadline", () => {
    const handle = setup();
    stripWithHistory(handle);

    handle.applyUserInput({ type: "dragStarted" });
    expect(handle.model.dragging, "otherwise the settle proves nothing").toBe(
      true,
    );
    handle.applyUserInput({ type: "slideCommitted", id: "uk" });

    expect(handle.model.active).toBe("uk");
    expect(handle.model.dragging).toBe(false);
    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });
  });

  it("ends the drag without moving active when the card is gone", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    handle.applyUserInput({ type: "dragStarted" });

    handle.applyUserInput({ type: "slideCommitted", id: "vanished" });

    expect(handle.model.active).toBe("uk");
    expect(handle.model.dragging).toBe(false);
    expectInvariants(handle.model);
  });

  it("marks a slid-to card as history so the sweep spares it", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    // a tap on the peeking candidate, not a drag — a drag clears the pending first
    handle.applyUserInput({ type: "slideCommitted", id: "usa" });

    expect(handle.model.entries["usa"]).toMatchObject({ wasActive: true });
    expect(handle.model.mode).toMatchObject({ mode: "selected" });
  });
});

describe("connectIssued", () => {
  it("moves active ahead of the service and enters live", () => {
    const handle = setup();
    step(
      handle,
      statusFor({
        uk: makeReadyToConnect("uk", 50),
        usa: makeReadyToConnect("usa", 10),
      }),
    );

    handle.applyUserInput({ type: "connectIssued", id: "uk" });

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "live" });
    expectInvariants(handle.model);
  });

  it("leaves a failed attempt parked on the destination we tried", () => {
    const handle = setup();
    const destinations = {
      uk: makeReadyToConnect("uk", 50),
      usa: makeReadyToConnect("usa", 10),
    };
    step(handle, statusFor(destinations));
    handle.applyUserInput({ type: "connectIssued", id: "uk" });

    // the connect failed: the next status carries no connection at all
    step(handle, statusFor(destinations));

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({ mode: "selected" });
  });
});

describe("reset", () => {
  it("clears suspension along with everything else", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeReadyToConnect("uk", 50) }));
    handle.applyUserInput({ type: "dragStarted" });
    handle.applyUserInput({ type: "listOpened" });
    expect(handle.model.listOpen, "otherwise the reset proves nothing").toBe(
      true,
    );

    handle.reset({ preferredLocation: null, lastConnectedDestination: null });

    expect(handle.model.listOpen).toBe(false);
    expect(handle.model.dragging).toBe(false);
    expect(handle.model.active).toBeNull();
    expectInvariants(handle.model);
  });
});

describe("invariants hold under randomized traffic", () => {
  // Seeded so a failure reproduces; the point is orderings no hand-written case thinks to try.
  const mulberry32 = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const IDS = ["a", "b", "c", "d"];

  it.each(Array.from({ length: 25 }, (_, i) => i + 1))(
    "survives sequence seed %i",
    (seed) => {
      const random = mulberry32(seed);
      const handle = setup({ preferredLocation: "c" });

      for (let stepIndex = 0; stepIndex < 60; stepIndex++) {
        const offered = IDS.filter(() => random() > 0.25);
        const destinations: Record<string, DestinationState> = {};
        for (const id of offered) {
          const roll = random();
          destinations[id] = roll < 0.15
            ? makeUnavailable(id)
            : roll < 0.3
            ? makeFull(id, Math.floor(random() * 100))
            : makeReadyToConnect(id, Math.floor(random() * 100));
        }

        const liveRoll = random();
        const liveId = offered.length > 0
          ? offered[Math.floor(random() * offered.length)]
          : null;
        const status = liveRoll < 0.2 && liveId !== null
          ? connectedTo(liveId, destinations)
          : statusFor(destinations);

        handle.applyStatusUpdate(status);
        expectInvariants(handle.model);

        const action = random();
        if (action < 0.1) {
          handle.applyUserInput({ type: "listOpened" });
        } else if (action < 0.2) {
          handle.applyUserInput({
            type: "listClosed",
            picked: random() < 0.5
              ? null
              : IDS[Math.floor(random() * IDS.length)],
          });
        } else if (action < 0.3) {
          handle.applyUserInput({ type: "dragStarted" });
        } else if (action < 0.4) {
          handle.applyUserInput({
            type: "slideCommitted",
            id: IDS[Math.floor(random() * IDS.length)],
          });
        } else if (action < 0.45) {
          handle.applyUserInput({
            type: "connectIssued",
            id: IDS[Math.floor(random() * IDS.length)],
          });
        }
        expectInvariants(handle.model);

        vi.advanceTimersByTime(Math.floor(random() * 4_000));
        expectInvariants(handle.model);
      }

      // the flat view the carousel consumes must stay consistent with the store
      expect(orderedEntries(handle.model).map((e) => e.id))
        .toEqual(handle.model.sequence);
    },
  );
});
