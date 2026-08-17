import { describe, expect, it } from "vitest";

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import {
  applyStatusUpdate,
  type AutoPending,
  type DestinationMode,
  type DestinationOrigin,
  type Entry,
  type StatusSnapshot,
} from "./destinationMode.ts";

// Stub suite for the reworked auto-phase model: each unimplemented case has
// its "given" state prepared, but act/assert is left as a TODO — it passes
// vacuously until filled in. `void ...` only silences noUnusedLocals until
// then; remove it once the assertions use these values.

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const BASE_DESTINATION: Destination = {
  id: "a",
  meta: { location: "EU" },
  address: "0x1234",
  routing: 1,
};

function destination(
  id: string,
  overrides: Partial<Destination> = {},
): Destination {
  return { ...BASE_DESTINATION, id, ...overrides };
}

function readyState(pingMs = 50): DestinationState["route_health"] {
  return {
    state: {
      state: "ReadyToConnect",
      exit: {
        checked_at: 0,
        versions: { versions: [], latest: "" },
        ping_rtt: pingMs,
        health: {
          slots: { available: 5, connected: 2 },
          load_avg: { one: 0.5, five: 0.5, fifteen: 0.5, nproc: 4 },
        },
      },
    },
    last_error: null,
    checking_since: null,
    consecutive_failures: 0,
  };
}

function notReadyState(): DestinationState["route_health"] {
  return {
    state: { state: "NeedsChannel" },
    last_error: null,
    checking_since: null,
    consecutive_failures: 0,
  };
}

function ready(id: string, pingMs = 50): DestinationState {
  return { destination: destination(id), route_health: readyState(pingMs) };
}

function notReady(id: string): DestinationState {
  return { destination: destination(id), route_health: notReadyState() };
}

// Distinct from `notReady`: no health record at all, vs. one that's present
// but unhealthy.
function missingHealthData(id: string): DestinationState {
  return { destination: destination(id), route_health: null };
}
void missingHealthData; // unused until the "disappears" scenario below is implemented

function snapshot(overrides: Partial<StatusSnapshot> = {}): StatusSnapshot {
  return {
    availableDestinations: [],
    destinations: {},
    preferredLocation: null,
    ...overrides,
  };
}

function entry(id: string, origin: DestinationOrigin, key: number): Entry {
  return { id, origin, key };
}

function pending(
  candidateId: string,
  now: number,
  countdownMs = 5_000,
  crossoverMs = 500,
): AutoPending {
  return {
    candidateId,
    countdownEndsAt: now + countdownMs,
    settleAt: now + countdownMs + crossoverMs,
  };
}

function autoMode(params: {
  entries: Entry[];
  active: string | null;
  pending?: AutoPending | null;
  nextKey?: number;
}): DestinationMode {
  const highestExistingKey = params.entries.reduce(
    (max, e) => Math.max(max, e.key),
    -1,
  );
  return {
    entries: new Map(params.entries.map((e) => [e.id, e])),
    sequence: params.entries.map((e) => e.id),
    active: params.active,
    mode: { phase: "auto", pending: params.pending ?? null },
    nextKey: params.nextKey ?? highestExistingKey + 1,
  };
}

// ---------------------------------------------------------------------------
// Bootstrap — this model has no `uninitialized` phase; `auto` with
// `active: null` is the starting point instead.
// ---------------------------------------------------------------------------

describe("auto phase / bootstrap", () => {
  it("first statusResponse with a ready destination arrives -> picks it immediately, no countdown", () => {
    const given = autoMode({ entries: [], active: null });
    const status = snapshot({
      availableDestinations: [destination("a")],
      destinations: { a: ready("a") },
    });

    const next = applyStatusUpdate(given, status);

    expect(next.active).toBe("a");
    expect(next.sequence).toEqual(["a"]);
    expect([...next.entries.values()]).toEqual([
      { id: "a", origin: "auto", key: 0 },
    ]);
    expect(next.mode).toEqual({ phase: "auto", pending: null });
  });

  it("first statusResponse arrives with no ready destination -> stays uninitialized (active null)", () => {
    const given = autoMode({ entries: [], active: null });
    const status = snapshot({
      availableDestinations: [destination("a")],
      destinations: { a: notReady("a") },
    });
    void given;
    void status; // TODO: act + assert — expect active still null, no entries.
  });
});

// ---------------------------------------------------------------------------
// User events
// ---------------------------------------------------------------------------

describe("auto phase / user events", () => {
  it("pickDestination(id) where id is a different, unlisted destination -> replaces active in place, enters selected", () => {
    const given = autoMode({
      entries: [entry("a", "auto", 0)],
      active: "a",
    });
    const pickedId = "b";
    void given;
    void pickedId; // TODO: act + assert — expect phase "selected", active "b", "a" dropped.
  });

  it("pickDestination(id) where id === active -> re-tags origin to user in place, enters selected", () => {
    const given = autoMode({
      entries: [entry("a", "auto", 0)],
      active: "a",
    });
    const pickedId = "a";
    void given;
    void pickedId; // TODO: act + assert — expect phase "selected", same entry now origin "user".
  });

  it("pickDestination(id) where id already sits elsewhere in entries -> drops the stale copy, re-adds fresh", () => {
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
    });
    const pickedId = "b";
    void given;
    void pickedId; // TODO: act + assert — expect exactly one "b" entry, fresh key, phase "selected".
  });

  it("pickDestination(id) where id is the current pending candidate -> discards the not-yet-settled candidate, promotes it directly", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now),
    });
    const pickedId = "b";
    void given;
    void pickedId; // TODO: act + assert — expect pending cleared, phase "selected", active "b".
  });

  it("setActiveEntry(id) where id is already in entries -> moves active pointer, enters selected with a fresh revert deadline", () => {
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
    });
    const targetId = "b";
    void given;
    void targetId; // TODO: act + assert — expect phase "selected", active "b", autoRevertAt set.
  });

  it("setActiveEntry(id) where id is the pending candidate -> short-circuits the countdown, promotes immediately", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now),
    });
    const targetId = "b";
    void given;
    void targetId; // TODO: act + assert — expect pending cleared, phase "selected", active "b".
  });

  it("setActiveEntry(id) where id is unknown -> no-op", () => {
    const given = autoMode({
      entries: [entry("a", "auto", 0)],
      active: "a",
    });
    const targetId = "not-in-entries";
    void given;
    void targetId; // TODO: act + assert — expect mode unchanged.
  });

  it("setActiveEntry(id) where id === active already -> still restarts as selected with a fresh revert deadline", () => {
    const given = autoMode({
      entries: [entry("a", "auto", 0)],
      active: "a",
    });
    const targetId = "a";
    void given;
    void targetId; // TODO: act + assert — expect phase "selected", same active, autoRevertAt set.
  });
});

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

describe("auto phase / timers", () => {
  it("settleAt reached, candidate is not preferredLocation -> commits active := candidateId, stays auto", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now),
    });
    const settleAt = given.mode.phase === "auto"
      ? given.mode.pending?.settleAt
      : undefined;
    void given;
    void settleAt; // TODO: act (advance clock to settleAt) + assert — expect active "b", pending null, phase still "auto".
  });

  it("settleAt reached, candidate === preferredLocation and promotion unused -> commits AND promotes to selected, consumes the flag", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now),
    });
    const preferredLocation = "b";
    const preferredPromotionUsed = false;
    void given;
    void preferredLocation;
    void preferredPromotionUsed; // TODO: act + assert — expect phase "selected", active "b", autoRevertAt set, promotion flag now consumed.
  });

  it("settleAt reached, candidate === preferredLocation but promotion already used -> commits, stays auto (no promotion)", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now),
    });
    const preferredLocation = "b";
    const preferredPromotionUsed = true;
    void given;
    void preferredLocation;
    void preferredPromotionUsed; // TODO: act + assert — expect active "b", pending null, phase still "auto" (promotion already spent).
  });
});

// ---------------------------------------------------------------------------
// statusResponse changes (availableDestinations / destinations / preferredLocation)
// ---------------------------------------------------------------------------

describe("auto phase / statusResponse changes", () => {
  it("a better candidate appears, no existing pending -> starts a new pending countdown, appends a speculative entry", () => {
    const given = autoMode({
      entries: [entry("a", "auto", 0)],
      active: "a",
    });
    const status = snapshot({
      availableDestinations: [destination("a"), destination("b")],
      destinations: { a: ready("a", 100), b: ready("b", 20) },
    });
    void given;
    void status; // TODO: act + assert — expect pending candidate "b", "b" appended to entries, active unchanged.
  });

  it("best candidate changes while pending is still within countdown -> retargets in place, timer not restarted", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now),
    });
    const status = snapshot({
      availableDestinations: [
        destination("a"),
        destination("b"),
        destination("c"),
      ],
      destinations: { a: ready("a", 100), b: ready("b", 20), c: ready("c", 5) },
    });
    void given;
    void status; // TODO: act + assert — expect pending.candidateId "c", same countdownEndsAt/settleAt, "b" entry replaced by "c".
  });

  it("best candidate changes after countdownEndsAt has passed -> ignored, original transition left to finish", () => {
    const now = 5_000; // at pending("b", 0).countdownEndsAt
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", 0),
    });
    const status = snapshot({
      availableDestinations: [
        destination("a"),
        destination("b"),
        destination("c"),
      ],
      destinations: { a: ready("a", 100), b: ready("b", 20), c: ready("c", 5) },
    });
    void now;
    void given;
    void status; // TODO: act + assert — expect pending unchanged (still targeting "b").
  });

  it("pending candidate reverts to equal active before settling -> cancels the transition outright", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now),
    });
    const status = snapshot({
      availableDestinations: [destination("a"), destination("b")],
      destinations: { a: ready("a", 10), b: ready("b", 10) }, // "a" now ranks first again
    });
    void given;
    void status; // TODO: act + assert — expect pending null, "b" entry removed, active still "a".
  });

  it("pending candidate stops being ready before settling -> cancels the transition, does not fall back to another candidate", () => {
    const now = 0;
    const given = autoMode({
      entries: [
        entry("a", "auto", 0),
        entry("b", "auto", 1),
        entry("c", "auto", 2),
      ],
      active: "a",
      pending: pending("b", now),
    });
    const status = snapshot({
      availableDestinations: [
        destination("a"),
        destination("b"),
        destination("c"),
      ],
      destinations: { a: ready("a", 100), b: notReady("b"), c: ready("c", 50) },
    });
    void given;
    void status; // TODO: act + assert — expect pending null, "b" entry removed, active still "a" — NOT retargeted to "c" yet (that's a fresh rule-5 pass, own countdown).
  });

  it("pending candidate's latency regresses past active's before settling -> cancels the transition", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now),
    });
    const status = snapshot({
      availableDestinations: [destination("a"), destination("b")],
      destinations: { a: ready("a", 20), b: ready("b", 200) }, // "b" got worse than "a"
    });
    void given;
    void status; // TODO: act + assert — expect pending null, "b" entry removed, active still "a".
  });

  it("active destination disappears entirely from availableDestinations -> best-candidate recompute ignores it, starts fresh pending toward the next best", () => {
    // Distinct from "active becomes not-ready": here `active`'s id is gone
    // from `availableDestinations` outright, not just unhealthy.
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: null,
    });
    const status = snapshot({
      availableDestinations: [destination("b")], // "a" is gone
      destinations: { b: ready("b", 50) },
    });
    void given;
    void status;
    // TODO: act + assert — decide expected shape once the reducer exists:
    // does `active` stay "a" (stale) until the pending candidate settles, or
    // does losing `active` from availableDestinations need its own immediate
    // rule rather than reusing rule 5's "different id" path?
  });

  it("preferredLocation changes mid-countdown -> promotion is evaluated against its value at settle time, not when pending was armed", () => {
    const now = 0;
    const given = autoMode({
      entries: [entry("a", "auto", 0), entry("b", "auto", 1)],
      active: "a",
      pending: pending("b", now), // armed while preferredLocation was null/other
    });
    const status = snapshot({
      availableDestinations: [destination("a"), destination("b")],
      destinations: { a: ready("a", 100), b: ready("b", 20) },
      preferredLocation: "b", // changed after the pending was armed
    });
    void given;
    void status; // TODO: act + assert once settle fires — expect promotion to fire using this updated preferredLocation.
  });

  it("backend reports connected/connecting/reconnecting for some id -> exits auto into connecting", () => {
    const given = autoMode({
      entries: [entry("a", "auto", 0)],
      active: "a",
    });
    const connectingId = "a";
    void given;
    void connectingId; // TODO: act + assert — expect phase "connecting", active unchanged, entry retained.
    // Not covering "connecting destination disappears" — the client handles that, not this module.
  });
});
