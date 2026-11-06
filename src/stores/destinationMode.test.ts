import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  connectionDestination,
  type Destination,
  type DestinationState,
} from "@src/services/vpnService.ts";
import {
  autoCandidate,
  cardPhase,
  createDestinationMode,
  type DestinationMode,
  type DestinationModeHandle,
  type DestinationModeSettings,
  effectiveActive,
  type ModeAppState,
  SELECTED_AUTO_REVERT_MS,
  STATUS_POLL_MS,
  SWITCH_COUNTDOWN_MS,
  type UserInputEvent,
} from "./destinationMode.ts";
import {
  eligibleRouteHealth,
  makeDestination,
  weakRouteHealth,
} from "@src/testing/destinations.ts";

// Derived from docs/destinationMode.md — where spec and implementation disagree, the spec wins and the case is expected to fail.

const BASE_DESTINATION: Destination = makeDestination({
  id: "a",
  address: "0x1234",
  geo: { country: "de", source: { type: "announced_ip" } },
});

/** Eligible; `relays` is distinct first relays, so a higher number ranks higher. */
function makeEligible(id: string, relays = 2): DestinationState {
  return {
    destination: { ...BASE_DESTINATION, id },
    route_health: eligibleRouteHealth(relays),
  };
}

/** Routable with a degraded best path — not ready, per the spec's eligibility rule. */
function makeWeak(id: string): DestinationState {
  return {
    destination: { ...BASE_DESTINATION, id },
    route_health: weakRouteHealth(),
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
    connection: { type: "disconnected" },
    probe: null,
  };
}

function connectedTo(
  id: string,
  destinations: Record<string, DestinationState>,
): ModeAppState {
  return {
    ...statusFor(destinations),
    connection: {
      type: "connected",
      destination: id,
      since: 0,
      tunnel_ping_rtt: null,
      stall: null,
    },
  };
}

function connectingTo(
  id: string,
  destinations: Record<string, DestinationState>,
): ModeAppState {
  return {
    ...statusFor(destinations),
    connection: {
      type: "connecting",
      destination: id,
      since: 0,
      phase: "init",
    },
  };
}

function setup(settings: Partial<DestinationModeSettings> = {}) {
  return createDestinationMode({
    preferredLocation: null,
    lastConnectedDestination: null,
    connectOnStartup: false,
    ...settings,
  });
}

/** The five invariants from docs/destinationMode.md — they must hold after every transition. */
function expectInvariants(model: DestinationMode): void {
  const { active, mode } = model;
  const pending = mode.mode === "auto" ? mode.pending : null;

  if (pending !== null) {
    expect(pending.candidateId, "1: candidate is not active").not.toBe(active);
  }
  if (mode.mode === "selected") {
    expect(active, "2: selected implies an active destination").not.toBeNull();
  }
  if (pending !== null) {
    expect(model.listOpen, "3: no pending while suspended").toBe(false);
    expect(active, "4: nothing to switch away from without an active one")
      .not.toBeNull();
  }
  if (mode.mode === "live") {
    expect(active, "5: live implies an active destination").not.toBeNull();
  }
}

/** Applies a status update and re-checks the invariants, plus the baseline: nothing points past what is offered. */
function step(handle: DestinationModeHandle, status: ModeAppState): void {
  handle.applyStatusUpdate(status);
  expectInvariants(handle.model);
  const offered = new Set(status.availableDestinations.map((d) => d.id));
  const { active, mode } = handle.model;
  // the service always offers the live destination; a test may not
  if (active !== null && active !== connectionDestination(status.connection)) {
    expect(offered.has(active), `active ${active} is offered`).toBe(true);
  }
  if (mode.mode === "auto" && mode.pending !== null) {
    expect(offered.has(mode.pending.candidateId), "the candidate is offered")
      .toBe(true);
  }
}

/** Same, for user input — the invariants hold after every transition, not just status updates. */
function input(
  handle: DestinationModeHandle,
  event: UserInputEvent,
): void {
  handle.applyUserInput(event);
  expectInvariants(handle.model);
}

/** A pick from the list that does not connect. */
function pick(handle: DestinationModeHandle, id: string): void {
  input(handle, { type: "listOpened" });
  input(handle, { type: "listClosed", picked: id });
}

const UK_USA = {
  uk: makeEligible("uk", 50),
  usa: makeEligible("usa", 90),
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("effectiveActive — the one reader of what we are on", () => {
  it("stays on the active destination until the countdown ends", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    expect(handle.model.active).toBe("uk");
    expect(effectiveActive(handle.model, Date.now())).toBe("uk");
    expect(effectiveActive(handle.model, Date.now() + SWITCH_COUNTDOWN_MS - 1))
      .toBe("uk");
  });

  it("reports the candidate from the deadline, before the commit timer has run", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    const deadline = Date.now() + SWITCH_COUNTDOWN_MS;
    expect(effectiveActive(handle.model, deadline)).toBe("usa");
    expect(handle.model.active, "the store has not committed yet").toBe("uk");
  });

  it("falls back to active for a pending gone stale by more than one poll", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    const wayPast = Date.now() + SWITCH_COUNTDOWN_MS + STATUS_POLL_MS + 1;
    expect(effectiveActive(handle.model, wayPast)).toBe("uk");
  });
});

describe("statusUpdate — baseline", () => {
  it("prunes active to what the backend still offers", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    expect(handle.model.active).toBe("usa");

    step(handle, statusFor({ fr: makeEligible("fr", 70) }));

    expect(handle.model.active).toBe("fr");
  });

  it("disarms a candidate that is no longer offered, so its successor counts down afresh", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    vi.setSystemTime(Date.now() + 1_000);
    step(
      handle,
      statusFor({ uk: makeEligible("uk", 50), fr: makeEligible("fr", 95) }),
    );

    // a retarget would have kept the vanished candidate's deadline
    expect(handle.model.mode).toEqual({
      mode: "auto",
      pending: {
        candidateId: "fr",
        countdownEndsAt: Date.now() + SWITCH_COUNTDOWN_MS,
      },
    });
  });
});

describe("statusUpdate — live", () => {
  it("takes priority over an armed countdown", async () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });

    step(handle, connectingTo("uk", UK_USA));

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "live" });

    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);
    expect(handle.model.mode).toEqual({ mode: "live" });
    expect(handle.model.active, "the candidate never committed").toBe("uk");
  });

  it("takes the live destination even when the prune removed it", () => {
    const handle = setup();

    step(handle, connectedTo("gone", { uk: makeEligible("uk", 50) }));

    expect(handle.model.active).toBe("gone");
    expect(handle.model.mode).toEqual({ mode: "live" });
  });

  it("closes an open list, since we did not start this connection from it", () => {
    const handle = setup();
    const destinations = { uk: makeEligible("uk", 50) };
    step(handle, statusFor(destinations));

    input(handle, { type: "listOpened" });
    expect(handle.model.listOpen).toBe(true);

    step(handle, connectedTo("uk", destinations));

    expect(handle.model.listOpen).toBe(false);
  });

  it("keeps a list opened while connecting open across polls", () => {
    const handle = setup();
    const destinations = { uk: makeEligible("uk", 50) };
    step(handle, connectingTo("uk", destinations));

    input(handle, { type: "listOpened" });
    step(handle, connectingTo("uk", destinations));

    expect(
      handle.model.listOpen,
      "the user opened it over live; polls must not close it",
    )
      .toBe(true);
  });

  it("keeps a list opened while connected open across polls", () => {
    const handle = setup();
    const destinations = { uk: makeEligible("uk", 50) };
    step(handle, connectedTo("uk", destinations));

    input(handle, { type: "listOpened" });
    step(handle, connectedTo("uk", destinations));

    expect(handle.model.listOpen).toBe(true);
  });

  it("keeps the list open when the backend switches destination under us", () => {
    const handle = setup();
    step(handle, connectedTo("uk", UK_USA));

    input(handle, { type: "listOpened" });
    step(handle, connectedTo("usa", UK_USA));

    expect(handle.model.listOpen, "only entering live closes the list").toBe(
      true,
    );
    expect(handle.model.active).toBe("usa");
  });

  it("retargets active when the backend switches destination under us", () => {
    const handle = setup();
    step(handle, connectedTo("uk", UK_USA));
    step(handle, connectedTo("usa", UK_USA));

    expect(handle.model.active).toBe("usa");
    expect(handle.model.mode).toEqual({ mode: "live" });
  });
});

describe("statusUpdate — leaving live", () => {
  it("parks on the destination we were connected to, then reverts to auto", async () => {
    const handle = setup();
    step(handle, connectedTo("uk", UK_USA));

    step(handle, statusFor(UK_USA));

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({ mode: "selected" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    step(handle, statusFor(UK_USA));
    expect(handle.model.mode.mode).toBe("auto");
  });

  it("lets auto propose again only once the hold runs out", async () => {
    const handle = setup();
    step(handle, connectedTo("uk", UK_USA));

    step(handle, statusFor(UK_USA));
    expect(handle.model.mode, "the hold keeps auto from arming")
      .toMatchObject({ mode: "selected" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    step(handle, statusFor(UK_USA));

    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });
  });

  it("does not close the list", () => {
    const handle = setup();
    const destinations = { uk: makeEligible("uk", 50) };
    step(handle, connectedTo("uk", destinations));
    input(handle, { type: "listOpened" });

    step(handle, statusFor(destinations));

    expect(handle.model.listOpen).toBe(true);
  });
});

describe("statusUpdate — suspension", () => {
  it("freezes the mode while the list is open", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    input(handle, { type: "listOpened" });

    step(handle, statusFor(UK_USA));

    expect(handle.model.mode, "nor arm a candidate")
      .toEqual({ mode: "auto", pending: null });
    expect(handle.model.active, "a suspended model does not switch").toBe("uk");
  });

  it("ends the suspension and cold starts when the active is pruned away", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    input(handle, { type: "listOpened" });

    step(handle, statusFor({ fr: makeEligible("fr", 70) }));

    expect(handle.model.listOpen, "a list over a vanished destination closes")
      .toBe(false);
    expect(handle.model.active).toBe("fr");
  });
});

describe("statusUpdate — selected", () => {
  it("holds the selection even once the destination stops being ready", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    pick(handle, "uk");

    step(
      handle,
      statusFor({
        uk: makeUnavailable("uk"),
        usa: makeEligible("usa", 90),
      }),
    );

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({ mode: "selected" });
  });

  it("reverts on the deadline via the status update, not the timer", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    pick(handle, "uk");
    expect(
      handle.model.mode,
      "the selection must land for the revert to mean anything",
    )
      .toMatchObject({ mode: "selected" });

    // the clock passes the deadline without the revert timer being allowed to run
    vi.setSystemTime(Date.now() + SELECTED_AUTO_REVERT_MS + 1);
    step(handle, statusFor(UK_USA));

    expect(handle.model.mode.mode).toBe("auto");
    expect(handle.model.mode, "and auto is proposing again")
      .toMatchObject({ pending: { candidateId: "usa" } });
  });
});

describe("auto — arming", () => {
  it("arms a countdown toward a better destination", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));

    step(handle, statusFor(UK_USA));

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({
      mode: "auto",
      pending: {
        candidateId: "usa",
        countdownEndsAt: Date.now() + SWITCH_COUNTDOWN_MS,
      },
    });
  });

  // The sort already sinks weak routes, so isolating the eligibility rule needs every destination weak.
  it("never arms toward a destination with a weak route", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));

    step(
      handle,
      statusFor({ uk: makeWeak("uk"), usa: makeWeak("usa") }),
    );

    expect(handle.model.active, "we stay put rather than chase a weak route")
      .toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });

  it("commits when the countdown ends, staying in auto", async () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);

    expect(handle.model.active).toBe("usa");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expectInvariants(handle.model);
  });

  it("commits from the clock when the timer was never allowed to fire", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });

    vi.setSystemTime(Date.now() + SWITCH_COUNTDOWN_MS);
    step(handle, statusFor(UK_USA));

    expect(handle.model.active).toBe("usa");
  });

  it("discards a pending slept past by more than one poll instead of committing it", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    vi.setSystemTime(Date.now() + SWITCH_COUNTDOWN_MS + STATUS_POLL_MS + 1);
    step(handle, statusFor(UK_USA));

    // re-derived from fresh data rather than committed blind
    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });
  });

  it("discards a pending its own timer slept through", async () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    // the clock jumps with the pending timer, so it fires this late
    vi.setSystemTime(Date.now() + STATUS_POLL_MS + 1);
    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);

    expect(handle.model.active, "the clock decides, not the timer").toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expectInvariants(handle.model);
  });
});

describe("auto — retargeting", () => {
  it("retargets a pending without restarting its countdown", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));
    const armed = handle.model.mode;
    const countdownEndsAt = armed.mode === "auto"
      ? armed.pending?.countdownEndsAt
      : null;

    vi.setSystemTime(Date.now() + 1_000);
    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 50),
        usa: makeEligible("usa", 60),
        fr: makeEligible("fr", 95),
      }),
    );

    expect(handle.model.mode).toEqual({
      mode: "auto",
      pending: { candidateId: "fr", countdownEndsAt },
    });
  });

  it("commits the due candidate before weighing a new one", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    vi.setSystemTime(Date.now() + SWITCH_COUNTDOWN_MS);
    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 50),
        usa: makeEligible("usa", 60),
        fr: makeEligible("fr", 95),
      }),
    );

    // the clock already switched to usa; fr gets a countdown of its own
    expect(handle.model.active).toBe("usa");
    expect(handle.model.mode).toEqual({
      mode: "auto",
      pending: {
        candidateId: "fr",
        countdownEndsAt: Date.now() + SWITCH_COUNTDOWN_MS,
      },
    });
  });
});

describe("auto — disarming", () => {
  it("drops the pending when the active becomes best again", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 90),
        usa: makeEligible("usa", 50),
      }),
    );

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });

  it("disarms when health data disappears entirely", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    step(
      handle,
      statusFor({ uk: makeUnavailable("uk"), usa: makeUnavailable("usa") }),
    );

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.active).toBe("uk");
  });
});

describe("cold start", () => {
  it("starts on lastConnected regardless of readiness, then drops the field", () => {
    const handle = setup({ lastConnectedDestination: "uk" });

    step(
      handle,
      statusFor({
        uk: makeUnavailable("uk"),
        usa: makeEligible("usa", 90),
      }),
    );

    expect(handle.model.active).toBe("uk");
    // where the last session left off is the user's choice, not auto's proposal
    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });
    expect(handle.model.lastConnectedDestination).toBeNull();
  });

  it("hands the lastConnected hold back to auto on the ordinary lease", () => {
    const handle = setup({ lastConnectedDestination: "uk" });
    step(handle, statusFor({ uk: makeUnavailable("uk") }));

    vi.advanceTimersByTime(SELECTED_AUTO_REVERT_MS);
    expectInvariants(handle.model);

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });

  it("stays in auto when the promotion is merely the best destination", () => {
    const handle = setup();

    step(handle, statusFor({ usa: makeEligible("usa", 90) }));

    expect(handle.model.active).toBe("usa");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });

  it("stays in auto when the promotion is a ready preferred location", () => {
    const handle = setup({ preferredLocation: "fr" });

    step(handle, statusFor({ fr: makeEligible("fr", 70) }));

    expect(handle.model.active).toBe("fr");
    // preferred is an input to the candidate, not a selection of its own
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });

  it("holds the promotion when a startup connect is coming", () => {
    const handle = setup({ connectOnStartup: true });

    step(handle, statusFor({ uk: makeUnavailable("uk") }));

    expect(handle.model.mode).toMatchObject({ mode: "selected" });
  });

  it("keeps auto from arming before the startup connect lands", () => {
    const handle = setup({ connectOnStartup: true });
    // nothing ready yet, so the promotion is the unready sort head
    step(
      handle,
      statusFor({ uk: makeUnavailable("uk"), usa: makeUnavailable("usa") }),
    );
    expect(handle.model.active).toBe("uk");

    // usa becomes ready: the hold keeps auto from arming toward it in this poll
    step(
      handle,
      statusFor({
        uk: makeUnavailable("uk"),
        usa: makeEligible("usa", 90),
      }),
    );
    expect(handle.model.mode, "the connect, not auto, moves us")
      .toMatchObject({ mode: "selected" });

    input(handle, { type: "connectIssued", id: "usa" });

    expect(handle.model.active).toBe("usa");
  });

  it("outranks a ready preferred location", () => {
    const handle = setup({
      lastConnectedDestination: "uk",
      preferredLocation: "fr",
    });

    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 50),
        fr: makeEligible("fr", 70),
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

    step(handle, statusFor({ usa: makeEligible("usa", 90) }));

    expect(handle.model.active).toBe("usa");
    expect(handle.model.lastConnectedDestination).toBeNull();
  });

  it("is consulted once per launch, not again mid-session", () => {
    const handle = setup({ lastConnectedDestination: "uk" });
    step(handle, statusFor(UK_USA));
    expect(handle.model.active).toBe("uk");

    // uk vanishes, forcing a mid-session cold start
    step(handle, statusFor({ usa: makeEligible("usa", 90) }));
    expect(handle.model.active).toBe("usa");

    // and coming back does not reinstate it
    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 95),
        usa: makeEligible("usa", 90),
      }),
    );
    expect(handle.model.active).toBe("usa");
  });

  it("promotes an unspent ready preferred location immediately, spending the shot", () => {
    const handle = setup({ preferredLocation: "fr" });

    step(
      handle,
      statusFor({
        fr: makeEligible("fr", 10),
        usa: makeEligible("usa", 90),
      }),
    );

    expect(handle.model.active).toBe("fr");
    expect(handle.model.preferredLocation).toBeNull();
    expect(handle.model.mode, "a promotion never arms a countdown")
      .toEqual({ mode: "auto", pending: null });
  });

  it("discards an armed pending and promotes directly when the active is pruned", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });

    // uk vanishes mid-countdown; a countdown with nothing to switch away from cannot survive
    step(handle, statusFor({ usa: makeEligible("usa", 90) }));

    expect(handle.model.active).toBe("usa");
    expect(handle.model.mode, "promotion, not a countdown")
      .toEqual({ mode: "auto", pending: null });
  });

  it("promotes the sort head when there is nothing else to go on", () => {
    const handle = setup();

    step(handle, statusFor(UK_USA));

    expect(handle.model.active).toBe("usa");
  });
});

describe("preferred location", () => {
  it("becomes the candidate under the ordinary countdown once routable", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 90),
        fr: makeUnavailable("fr"),
      }),
    );
    expect(handle.model.active).toBe("uk");

    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 90),
        fr: makeEligible("fr", 10),
      }),
    );

    expect(handle.model.mode).toMatchObject({ pending: { candidateId: "fr" } });
  });

  it("does not restart a countdown it takes over", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 50),
        usa: makeEligible("usa", 90),
        fr: makeUnavailable("fr"),
      }),
    );
    const armed = handle.model.mode;
    const countdownEndsAt = armed.mode === "auto"
      ? armed.pending?.countdownEndsAt
      : null;

    vi.setSystemTime(Date.now() + 1_000);
    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 50),
        usa: makeEligible("usa", 90),
        fr: makeEligible("fr", 10),
      }),
    );

    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "fr", countdownEndsAt },
    });
  });

  it("is spent only once it becomes active", async () => {
    const handle = setup({ preferredLocation: "fr" });
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 50),
        fr: makeEligible("fr", 10),
      }),
    );
    expect(handle.model.preferredLocation).toBe("fr");

    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);

    expect(handle.model.active).toBe("fr");
    expect(handle.model.preferredLocation).toBeNull();
  });

  it("keeps its shot when it stops being ready before committing", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 50),
        fr: makeEligible("fr", 10),
      }),
    );

    step(
      handle,
      statusFor({
        uk: makeEligible("uk", 50),
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
        uk: makeEligible("uk", 50),
        usa: makeEligible("usa", 90),
        fr: makeUnavailable("fr"),
      }),
    );

    pick(handle, "uk");

    expect(
      handle.model.active,
      "the pick has to land for this to mean anything",
    )
      .toBe("uk");
    expect(handle.model.preferredLocation).toBe("fr");
  });

  it("needs a full-value path, not just a routable state", () => {
    const handle = setup({ preferredLocation: "fr" });
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));

    step(
      handle,
      statusFor({ uk: makeEligible("uk", 50), fr: makeWeak("fr") }),
    );

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.preferredLocation).toBe("fr");
  });
});

describe("listOpened", () => {
  it("clears an armed pending", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    input(handle, { type: "listOpened" });

    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.active).toBe("uk");
    expect(handle.model.listOpen).toBe(true);
  });

  it("stops the selected deadline rather than letting it run out", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    pick(handle, "uk");

    input(handle, { type: "listOpened" });

    expect(handle.model.mode).toEqual({ mode: "selected", autoRevertAt: null });
  });
});

describe("listClosed — cancelled", () => {
  it("resumes auto from a clean slate", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));
    input(handle, { type: "listOpened" });

    input(handle, { type: "listClosed", picked: null });

    expect(handle.model.listOpen).toBe(false);
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });

    step(handle, statusFor(UK_USA));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });
  });

  it("restores a selection with a fresh deadline", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    pick(handle, "uk");
    input(handle, { type: "listOpened" });

    vi.setSystemTime(Date.now() + SELECTED_AUTO_REVERT_MS * 2);
    input(handle, { type: "listClosed", picked: null });

    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });
  });

  it("leaves live alone", () => {
    const handle = setup();
    const destinations = { uk: makeEligible("uk", 50) };
    step(handle, connectedTo("uk", destinations));
    input(handle, { type: "listOpened" });

    input(handle, { type: "listClosed", picked: null });

    expect(handle.model.mode).toEqual({ mode: "live" });
  });
});

describe("autoResumed", () => {
  it("drops a manual pick, closes the list and lets auto choose again", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    pick(handle, "uk");
    input(handle, { type: "listOpened" });

    input(handle, { type: "autoResumed" });

    expect(handle.model.listOpen).toBe(false);
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });

    step(handle, statusFor(UK_USA));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });
  });

  it("leaves live alone", () => {
    const handle = setup();
    step(handle, connectedTo("uk", { uk: makeEligible("uk", 50) }));
    input(handle, { type: "listOpened" });

    input(handle, { type: "autoResumed" });

    expect(handle.model.listOpen).toBe(false);
    expect(handle.model.mode).toEqual({ mode: "live" });
  });
});

describe("autoCandidate", () => {
  it("takes the preferred location while it is ready, else the sort head", () => {
    expect(autoCandidate(statusFor(UK_USA), null)).toBe("usa");
    expect(autoCandidate(statusFor(UK_USA), "uk")).toBe("uk");
    expect(autoCandidate(statusFor(UK_USA), "gone")).toBe("usa");
  });
});

describe("listClosed — picked", () => {
  it("makes the pick active with a fresh deadline", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    expect(handle.model.active).toBe("usa");

    pick(handle, "uk");

    expect(handle.model.active).toBe("uk");
    expect(handle.model.listOpen).toBe(false);
    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });
  });

  it("stays live when the pick connected on the way out", () => {
    const handle = setup();
    // cold start lands on the faster usa, so uk is the pick that actually moves
    step(handle, statusFor(UK_USA));

    input(handle, { type: "listOpened" });
    // the list issues connect before it closes
    input(handle, { type: "connectIssued", id: "uk" });
    input(handle, { type: "listClosed", picked: "uk" });

    expect(handle.model.mode).toEqual({ mode: "live" });
    expect(handle.model.active).toBe("uk");
  });

  it("treats picking the already-active destination as a cancel with a fresh deadline", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));

    pick(handle, "uk");

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({
      mode: "selected",
      autoRevertAt: Date.now() + SELECTED_AUTO_REVERT_MS,
    });
  });

  it("activates a pick made before anything is active", () => {
    const handle = setup();

    pick(handle, "uk");

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({ mode: "selected" });
  });
});

describe("a due pending is committed, not discarded", () => {
  /** uk active with a pending on usa, the clock already past its deadline but the timer never fired. */
  function duePending(handle: DestinationModeHandle, pastDeadline = 0): void {
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));
    vi.setSystemTime(Date.now() + SWITCH_COUNTDOWN_MS + pastDeadline);
  }

  it("listOpened lands on the candidate the clock already chose", () => {
    const handle = setup();
    duePending(handle);

    input(handle, { type: "listOpened" });

    expect(handle.model.active, "effectiveActive already reported usa")
      .toBe("usa");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
    expect(handle.model.listOpen).toBe(true);
  });

  it("listOpened discards a stale pending", () => {
    const handle = setup();
    duePending(handle, STATUS_POLL_MS + 1);

    input(handle, { type: "listOpened" });

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
  });
});

describe("connectIssued", () => {
  it("moves active ahead of the service and enters live", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));

    input(handle, { type: "connectIssued", id: "uk" });

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toEqual({ mode: "live" });
  });

  it("clears an armed pending, so nothing counts down during the attempt", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));
    expect(handle.model.mode).toMatchObject({
      pending: { candidateId: "usa" },
    });

    input(handle, { type: "connectIssued", id: "uk" });

    expect(handle.model.mode).toEqual({ mode: "live" });
    expect(
      effectiveActive(handle.model, Date.now() + SWITCH_COUNTDOWN_MS),
      "the candidate never commits",
    ).toBe("uk");
  });

  it("replaces the promotion when the startup connect disagrees with it", () => {
    // cold start takes lastConnected regardless of readiness; pickStartupTarget needs ready
    const handle = setup({ lastConnectedDestination: "uk" });
    step(
      handle,
      statusFor({ uk: makeWeak("uk"), usa: makeEligible("usa", 90) }),
    );
    expect(handle.model.active).toBe("uk");

    input(handle, { type: "connectIssued", id: "usa" });

    expect(handle.model.active).toBe("usa");
    expect(handle.model.mode).toEqual({ mode: "live" });
  });

  it("leaves a failed attempt parked on the destination we tried", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    input(handle, { type: "connectIssued", id: "uk" });

    // the connect failed: the next status carries no connection at all
    step(handle, statusFor(UK_USA));

    expect(handle.model.active).toBe("uk");
    expect(handle.model.mode).toMatchObject({ mode: "selected" });
  });
});

describe("cardPhase — which label the card wears", () => {
  it("wears auto's label only while nothing is pending", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));

    expect(cardPhase(handle.model)).toBe("auto");
  });

  it("drops auto's label once a candidate is armed", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    step(handle, statusFor(UK_USA));

    expect(cardPhase(handle.model), "no longer provably best")
      .toBe("selected");
  });

  it("reads as connecting while live", () => {
    const handle = setup();
    step(handle, connectedTo("uk", { uk: makeEligible("uk", 50) }));

    expect(cardPhase(handle.model)).toBe("connecting");
  });

  it("calls a user selection selected, even when it is the best destination", () => {
    const handle = setup();
    step(handle, statusFor(UK_USA));
    pick(handle, "usa");

    expect(cardPhase(handle.model)).toBe("selected");
  });
});

describe("reset", () => {
  it("clears suspension along with everything else", () => {
    const handle = setup();
    step(handle, statusFor({ uk: makeEligible("uk", 50) }));
    input(handle, { type: "listOpened" });
    expect(handle.model.listOpen, "otherwise the reset proves nothing").toBe(
      true,
    );

    handle.reset({
      preferredLocation: null,
      lastConnectedDestination: null,
      connectOnStartup: false,
    });

    expect(handle.model.listOpen).toBe(false);
    expect(handle.model.active).toBeNull();
    expect(handle.model.mode).toEqual({ mode: "auto", pending: null });
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
            ? makeWeak(id)
            : makeEligible(id, 1 + Math.floor(random() * 100));
        }

        const liveRoll = random();
        const liveId = offered.length > 0
          ? offered[Math.floor(random() * offered.length)]
          : null;
        const status = liveRoll < 0.2 && liveId !== null
          ? connectedTo(liveId, destinations)
          : liveRoll < 0.3 && liveId !== null
          ? connectingTo(liveId, destinations)
          : statusFor(destinations);

        step(handle, status);

        const action = random();
        if (action < 0.1) {
          input(handle, { type: "listOpened" });
        } else if (action < 0.2) {
          input(handle, {
            type: "listClosed",
            picked: random() < 0.5
              ? null
              : IDS[Math.floor(random() * IDS.length)],
          });
        } else if (action < 0.25) {
          input(handle, { type: "autoResumed" });
        } else if (action < 0.3) {
          input(handle, {
            type: "connectIssued",
            id: IDS[Math.floor(random() * IDS.length)],
          });
        }

        vi.advanceTimersByTime(Math.floor(random() * 4_000));
        expectInvariants(handle.model);
      }
    },
  );
});
