import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import {
  createDestinationMode,
  currentDisplayId,
  type DestinationModel,
  type ModeAppState,
  type ModeSettingsState,
  resolveConnectTarget,
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

function makeReadyToConnect(
  id: string,
  pingNanos = 50_000_000,
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
            slots: { available: 5, connected: 2 },
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

const disposeFns: Array<() => void> = [];

function setup(
  appOverrides: Partial<ModeAppState> = {},
  settingsOverrides: Partial<ModeSettingsState> = {},
) {
  const [appState, setAppState] = createStore<ModeAppState>({
    availableDestinations: [],
    destinations: {},
    connected: null,
    connecting: null,
    reconnecting: null,
    ...appOverrides,
  });
  const [settings, setSettings] = createStore<ModeSettingsState>({
    preferredLocation: null,
    lastConnectedDestination: null,
    ...settingsOverrides,
  });

  const model = createRoot((dispose) => {
    disposeFns.push(dispose);
    return createDestinationMode(appState, settings);
  });

  return { appState, setAppState, settings, setSettings, model };
}

// `entries` id list, in order — the assertion shorthand used throughout
// instead of repeating `.map((e) => e.id)` at every call site.
function ids(entries: Array<{ id: string }>): string[] {
  return entries.map((e) => e.id);
}

// A plain function call, not a direct `const x = model[0]` copy — TS treats
// the latter as an alias of `model[0]` and incorrectly carries over an
// earlier, unrelated `if (model[0].phase !== ...)` guard's narrowing even
// past an intervening action call. Routing through a function breaks that.
function snapshot(
  model: readonly [DestinationModel, unknown],
): DestinationModel {
  return model[0];
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  disposeFns.splice(0).forEach((d) => d());
  vi.useRealTimers();
});

describe("startup (rules 0-4)", () => {
  it("stays uninitialized before any destinations batch arrives", () => {
    const { model } = setup();
    expect(model[0]).toEqual({ phase: "uninitialized" });
  });

  it("falls back to auto with an immediate, uncounted first pick when nothing else applies (rule 4)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();

    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    expect(model[0]).toMatchObject({
      phase: "auto",
      activeId: "fast",
      pending: null,
    });
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast"]);
    expect(model[0].entries[0].origin).toBe("auto");
  });

  it("starts in selected with the persisted last-connected destination when known (rule 3)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const last = { ...BASE_DESTINATION, id: "last" };
    const { model, setAppState } = setup(
      {},
      { lastConnectedDestination: "last" },
    );

    setAppState("availableDestinations", [fast, last]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 10_000_000),
      last: makeReadyToConnect("last", 500_000_000),
    });
    await Promise.resolve();

    expect(model[0]).toMatchObject({ phase: "selected", activeId: "last" });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["last"]);
    expect(model[0].autoRevertAt).toBe(Date.now() + SELECTED_AUTO_REVERT_MS);
  });

  it("prefers a ready preferred location over the persisted last-connected destination, consuming the promotion (rule 2)", async () => {
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const last = { ...BASE_DESTINATION, id: "last" };
    const { model, setAppState } = setup({}, {
      preferredLocation: "preferred",
      lastConnectedDestination: "last",
    });

    setAppState("availableDestinations", [preferred, last]);
    setAppState("destinations", {
      preferred: makeReadyToConnect("preferred"),
      last: makeReadyToConnect("last"),
    });
    await Promise.resolve();

    expect(model[0]).toMatchObject({
      phase: "selected",
      activeId: "preferred",
    });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(model[0].autoRevertAt).toBe(Date.now() + SELECTED_AUTO_REVERT_MS);

    // The promotion flag is consumed immediately — a later becomes-ready
    // cycle for the same preferred location must not promote again.
    setAppState("availableDestinations", [preferred, last]);
    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    expect(model[0].phase).toBe("auto");
    setAppState("destinations", {
      preferred: makeUnavailable("preferred"),
      last: makeReadyToConnect("last"),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    setAppState("destinations", {
      preferred: makeReadyToConnect("preferred"),
      last: makeReadyToConnect("last"),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "preferred" });
  });

  it("live connection wins over everything, including a ready preferred location (rule 1)", async () => {
    const stale = { ...BASE_DESTINATION, id: "stale" };
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const { model, setAppState } = setup(
      { connected: { destination_id: "stale", since: 0 } },
      { preferredLocation: "preferred" },
    );

    setAppState("availableDestinations", [stale, preferred]);
    setAppState("destinations", {
      stale: makeReadyToConnect("stale"),
      preferred: makeReadyToConnect("preferred"),
    });
    await Promise.resolve();

    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "stale" });
    if (model[0].phase !== "connecting") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["stale"]);
  });
});

describe("auto loop (rules 5-8)", () => {
  function setupInAuto() {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const ctx = setup();
    ctx.setAppState("availableDestinations", [fast]);
    ctx.setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
    });
    return { ...ctx, fast };
  }

  it("appends a speculative candidate entry and starts pending when a better one appears (rule 5)", async () => {
    const { model, setAppState, fast } = setupInAuto();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();

    expect(model[0].phase).toBe("auto");
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(model[0].activeId).toBe("fast");
    expect(ids(model[0].entries)).toEqual(["fast", "better"]);
    expect(model[0].entries[1].origin).toBe("auto");
    expect(model[0].pending?.candidateId).toBe("better");
    expect(model[0].pending?.countdownEndsAt).toBe(
      Date.now() + SWITCH_COUNTDOWN_MS,
    );
    expect(model[0].pending?.settleAt).toBe(Date.now() + SETTLE_MS);
  });

  it("removes the speculative entry and clears pending if the candidate reverts before settling (rule 6)", async () => {
    const { model, setAppState, fast } = setupInAuto();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast", "better"]);

    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeUnavailable("better"),
    });
    await Promise.resolve();
    expect(model[0]).toMatchObject({
      phase: "auto",
      activeId: "fast",
      pending: null,
    });
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast"]);

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "fast" });
  });

  it("commits at settleAt: activeId moves to the candidate, phase stays auto (rule 7, non-preferred)", async () => {
    const { model, setAppState, fast } = setupInAuto();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(model[0]).toMatchObject({
      phase: "auto",
      activeId: "better",
      pending: null,
    });
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast", "better"]);
  });

  it("promotes to selected at settleAt when the candidate equals the preferred location, consuming the flag (rule 7, preferred)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const { model, setAppState } = setup({}, {
      preferredLocation: "preferred",
    });
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    setAppState("availableDestinations", [fast, preferred]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeReadyToConnect("preferred", 1_000_000),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(model[0]).toMatchObject({
      phase: "selected",
      activeId: "preferred",
    });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(model[0].autoRevertAt).toBe(Date.now() + SELECTED_AUTO_REVERT_MS);
  });

  it("keeps detecting further candidates indefinitely (rule 8)", async () => {
    const { model, setAppState, fast } = setupInAuto();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    const best = { ...BASE_DESTINATION, id: "best" };
    setAppState("availableDestinations", [fast, better, best]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
      best: makeReadyToConnect("best", 1_000_000),
    });
    await Promise.resolve();

    expect(model[0]).toMatchObject({ pending: { candidateId: "best" } });
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast", "better", "best"]);
  });

  it("treats the active entry going not-ready as just another better-candidate detection, no special-case needed (rule 8)", async () => {
    const other = { ...BASE_DESTINATION, id: "other" };
    const { model, setAppState, fast } = setupInAuto();
    setAppState("availableDestinations", [fast, other]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      other: makeReadyToConnect("other", 10_000_000),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(model[0]).toMatchObject({ activeId: "other" });

    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      other: makeUnavailable("other"),
    });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ pending: { candidateId: "fast" } });
  });
});

describe("preferred promotion (rules 2 & 7 together)", () => {
  it("promotes to selected exactly once per run, even across a later becomes-ready cycle", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const { model, setAppState } = setup({}, {
      preferredLocation: "preferred",
    });

    setAppState("availableDestinations", [fast, preferred]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeUnavailable("preferred"),
    });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "fast" });

    // preferred becomes ready -> pending, then commits and promotes.
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeReadyToConnect("preferred"),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(model[0]).toMatchObject({
      phase: "selected",
      activeId: "preferred",
    });

    // Flat 10s idle timer applies uniformly — no more 5s sticky-match.
    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "preferred" });

    // preferred flips unready, then ready again -> a second becomes-ready
    // commit updates activeId normally but must not promote again.
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeUnavailable("preferred"),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "fast" });

    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeReadyToConnect("preferred"),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(model[0]).toMatchObject({ phase: "auto", activeId: "preferred" });
  });
});

describe("setActiveEntry — scroll-to-card (rule 10)", () => {
  // setActiveEntry only makes sense for ids already visible in the banner —
  // unlike pickDestination (any known destination via the vertical list),
  // an id only ever enters `entries` via the auto loop (rule 5) or a
  // connecting-phase pick (rule 14). Two destinations tied on latency would
  // never grow the list past one entry, so every scenario below grows real
  // history via the auto loop first, then scrolls back through it.
  async function setupWithHistory() {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const better = { ...BASE_DESTINATION, id: "better" };
    const ctx = setup();
    ctx.setAppState("availableDestinations", [fast]);
    ctx.setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
    });
    await Promise.resolve();

    ctx.setAppState("availableDestinations", [fast, better]);
    ctx.setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    // entries: ["fast", "better"], activeId: "better", phase: "auto".
    return { ...ctx, fast, better };
  }

  it("moves activeId to an existing, non-active entry and enters selected with a fresh 10s timer, issuing no VPN action", async () => {
    const { model } = await setupWithHistory();
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "better" });

    model[1].setActiveEntry("fast");
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "fast" });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(model[0].autoRevertAt).toBe(Date.now() + SELECTED_AUTO_REVERT_MS);
    expect(ids(model[0].entries)).toEqual(["fast", "better"]);
  });

  it("is a no-op when the target id isn't an existing entry", async () => {
    const { model } = await setupWithHistory();

    model[1].setActiveEntry("nonexistent");
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "better" });
  });

  it("is a no-op while connecting — retargeting a live connection goes through a real connect() call, not this action (rule 13)", async () => {
    const { model, setAppState } = await setupWithHistory();

    setAppState("connecting", {
      destination_id: "better",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();
    expect(model[0]).toMatchObject({
      phase: "connecting",
      activeId: "better",
    });

    model[1].setActiveEntry("fast");
    expect(model[0]).toMatchObject({
      phase: "connecting",
      activeId: "better",
    });
  });

  it("restarts the grace timer when called again on a different entry while already selected", async () => {
    const { model } = await setupWithHistory();

    model[1].setActiveEntry("fast");
    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS - 1_000);
    model[1].setActiveEntry("better");
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "better" });

    // The cancelled "fast" timer must not fire and flip things later.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "better" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS - 1_000);
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "better" });
  });

  it("scrolling to a not-yet-settled auto candidate commits it immediately, short-circuiting the countdown", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const better = { ...BASE_DESTINATION, id: "better" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
    });
    await Promise.resolve();

    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ pending: { candidateId: "better" } });

    model[1].setActiveEntry("better");
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "better" });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast", "better"]);
  });

  it("discards an unrelated not-yet-settled candidate entry when activating a different, already-settled entry", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const mid = { ...BASE_DESTINATION, id: "mid" };
    const best = { ...BASE_DESTINATION, id: "best" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
    });
    await Promise.resolve();

    setAppState("availableDestinations", [fast, mid]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      mid: makeReadyToConnect("mid", 50_000_000),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "mid" });

    setAppState("availableDestinations", [fast, mid, best]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      mid: makeReadyToConnect("mid", 50_000_000),
      best: makeReadyToConnect("best", 10_000_000),
    });
    await Promise.resolve();
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast", "mid", "best"]);
    expect(model[0].pending?.candidateId).toBe("best");

    // "fast" already existed before the speculative append — activating it
    // must drop the orphaned "best" entry, which never settled.
    model[1].setActiveEntry("fast");
    const afterActivate = snapshot(model);
    expect(afterActivate).toMatchObject({
      phase: "selected",
      activeId: "fast",
    });
    if (afterActivate.phase !== "selected") throw new Error("unreachable");
    expect(ids(afterActivate.entries)).toEqual(["fast", "mid"]);
  });
});

describe("pickDestination — ExitNodeList pick (rules 9 & 14)", () => {
  it("replaces the active entry in place, tags it user-origin, and enters selected with a fresh 10s timer (rule 9, from auto)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    model[1].pickDestination("picked");
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "picked" });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(model[0].entries).toEqual([{ id: "picked", origin: "user" }]);
    expect(model[0].autoRevertAt).toBe(Date.now() + SELECTED_AUTO_REVERT_MS);
  });

  it("replaces the active entry in place again when picking while already selected (rule 9, re-pick)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const other = { ...BASE_DESTINATION, id: "other" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast, other]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      other: makeReadyToConnect("other"),
    });
    await Promise.resolve();

    model[1].pickDestination("other");
    expect(model[0]).toMatchObject({ activeId: "other" });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["other"]);

    model[1].pickDestination("third");
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "third" });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["third"]);
  });

  it("discards a not-yet-settled auto candidate when picking a different destination outright", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const better = { ...BASE_DESTINATION, id: "better" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
    });
    await Promise.resolve();

    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast", "better"]);

    model[1].pickDestination("picked");
    const afterPick = snapshot(model);
    if (afterPick.phase !== "selected") throw new Error("unreachable");
    expect(ids(afterPick.entries)).toEqual(["picked"]);
  });

  it("appends a new user-origin entry without moving activeId while connecting (rule 14)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    setAppState("connecting", {
      destination_id: "fast",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });

    model[1].pickDestination("other");
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });
    if (model[0].phase !== "connecting") throw new Error("unreachable");
    expect(model[0].entries).toEqual([
      { id: "fast", origin: "auto" },
      { id: "other", origin: "user" },
    ]);
  });

  it("does not duplicate the entry once the backend actually confirms connecting to the picked id (rules 12+14 together)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    setAppState("connecting", {
      destination_id: "fast",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();

    model[1].pickDestination("other");
    await Promise.resolve();

    setAppState("connecting", {
      destination_id: "other",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();

    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "other" });
    if (model[0].phase !== "connecting") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast", "other"]);
  });

  it("drops the duplicate when the pick already sits elsewhere in entries, keeping the list unique-by-id", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    // Accumulate entries ["fast", "better", "third"] via the same rule-5
    // countdown/settle sequence the real candidate-detection loop would use,
    // ending with activeId "third" and no pending candidate.
    model[1].debugAppendAutoEntry("better");
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    model[1].debugAppendAutoEntry("third");
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast", "better", "third"]);
    expect(model[0].activeId).toBe("third");

    model[1].pickDestination("fast");
    const afterPick = snapshot(model);
    if (afterPick.phase !== "selected") throw new Error("unreachable");
    expect(afterPick.entries).toEqual([
      { id: "better", origin: "auto" },
      { id: "fast", origin: "user" },
    ]);
    expect(afterPick.activeId).toBe("fast");
  });

  it("re-picking the currently active entry doesn't remove it, just re-tags it user-origin", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    model[1].debugAppendAutoEntry("better");
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(model[0].activeId).toBe("better");

    model[1].pickDestination("better");
    const afterPick = snapshot(model);
    if (afterPick.phase !== "selected") throw new Error("unreachable");
    expect(afterPick.entries).toEqual([
      { id: "fast", origin: "auto" },
      { id: "better", origin: "user" },
    ]);
    expect(afterPick.activeId).toBe("better");
  });
});

describe("selected auto-revert — flat, unconditional 10s (rule 11)", () => {
  it("reverts to auto at the flat 10s deadline regardless of whether the entry matches the current auto-best pick", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const slow = { ...BASE_DESTINATION, id: "slow" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast, slow]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 10_000_000), // best auto pick
      slow: makeReadyToConnect("slow", 500_000_000),
    });
    await Promise.resolve();

    // "slow" was never auto-appended (it's never the better pick), so
    // reaching it has to go through pickDestination, not setActiveEntry.
    model[1].pickDestination("slow");
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "slow" });

    // Reverts to auto with "slow" as activeId — since "fast" is the better
    // auto pick, the auto loop immediately starts its own pending countdown
    // toward it, on top of (not instead of) the revert being tested here.
    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    expect(model[0]).toMatchObject({
      phase: "auto",
      activeId: "slow",
      pending: { candidateId: "fast" },
    });
  });

  it("applies the exact same flat timer to a startup landing as to a manual pick", async () => {
    const last = { ...BASE_DESTINATION, id: "last" };
    const { model, setAppState } = setup(
      {},
      { lastConnectedDestination: "last" },
    );
    setAppState("availableDestinations", [last]);
    setAppState("destinations", { last: makeReadyToConnect("last") });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "last" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "last" });
  });

  it("restarts the grace timer on a fresh manual pick, cancelling the earlier one", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const other = { ...BASE_DESTINATION, id: "other" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast, other]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      other: makeReadyToConnect("other"),
    });
    await Promise.resolve();

    model[1].pickDestination("other");
    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS - 1_000);
    model[1].pickDestination("fast");
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "fast" });

    // The cancelled "other" timer must not fire and flip things later.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "fast" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS - 1_000);
    expect(model[0]).toMatchObject({
      phase: "auto",
      activeId: "fast",
      pending: null,
    });
  });

  it("connecting during the grace window cancels the pending revert", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    model[1].setActiveEntry("fast");

    setAppState("connecting", {
      destination_id: "fast",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });
  });
});

describe("connecting / disconnect (rules 12 & 15)", () => {
  it("connecting to a destination from auto enters connecting, appending it if new", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();
    expect(model[0].phase).toBe("auto");

    setAppState("connecting", {
      destination_id: "fast",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });
    if (model[0].phase !== "connecting") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["fast"]);
  });

  it("connecting to a destination from selected enters connecting", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();
    model[1].setActiveEntry("fast");

    setAppState("connected", { destination_id: "fast", since: 0 });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });
  });

  it("lands on selected with the last active id once nothing is connecting/connected/reconnecting, even while disconnecting is still populated (rule 15)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    setAppState("connected", { destination_id: "fast", since: 0 });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });

    setAppState("connected", null);
    await Promise.resolve();

    expect(model[0]).toMatchObject({ phase: "selected", activeId: "fast" });
    if (model[0].phase !== "selected") throw new Error("unreachable");
    expect(model[0].autoRevertAt).toBe(Date.now() + SELECTED_AUTO_REVERT_MS);
  });

  it("retargets in place while already connecting, with no interstitial phase", async () => {
    const a = { ...BASE_DESTINATION, id: "a" };
    const b = { ...BASE_DESTINATION, id: "b" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [a, b]);
    setAppState("destinations", {
      a: makeReadyToConnect("a"),
      b: makeReadyToConnect("b"),
    });
    setAppState("connected", { destination_id: "a", since: 0 });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "a" });

    setAppState("connected", null);
    setAppState("connecting", {
      destination_id: "b",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();

    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "b" });
    if (model[0].phase !== "connecting") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["a", "b"]);
  });
});

describe("unavailable non-auto entry falls back to auto (rule 16)", () => {
  it("transitions selected -> auto and immediately runs the normal candidate-pending sequence toward the best remaining destination", async () => {
    const picked = { ...BASE_DESTINATION, id: "picked" };
    const backup = { ...BASE_DESTINATION, id: "backup" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [picked, backup]);
    setAppState("destinations", {
      picked: makeReadyToConnect("picked"),
      backup: makeReadyToConnect("backup"),
    });
    await Promise.resolve();

    model[1].pickDestination("picked");
    expect(model[0]).toMatchObject({ phase: "selected", activeId: "picked" });

    setAppState("destinations", {
      picked: makeUnavailable("picked"),
      backup: makeReadyToConnect("backup"),
    });
    await Promise.resolve();

    expect(model[0]).toMatchObject({
      phase: "auto",
      activeId: "picked",
      pending: { candidateId: "backup" },
    });
    if (model[0].phase !== "auto") throw new Error("unreachable");
    expect(ids(model[0].entries)).toEqual(["picked", "backup"]);

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(model[0]).toMatchObject({ phase: "auto", activeId: "backup" });
  });

  it("does not fire while connecting — a live connection going away is handled by rule 15, not this fallback", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { model, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    setAppState("connected", { destination_id: "fast", since: 0 });
    await Promise.resolve();
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });

    setAppState("destinations", { fast: makeUnavailable("fast") });
    await Promise.resolve();
    // Still connecting — the backend, not readiness, governs this phase.
    expect(model[0]).toMatchObject({ phase: "connecting", activeId: "fast" });
  });
});

describe("resolveConnectTarget", () => {
  it("targets null while uninitialized", () => {
    expect(resolveConnectTarget({ phase: "uninitialized" }, 0)).toBeNull();
  });

  it("targets activeId while selected", () => {
    expect(
      resolveConnectTarget(
        { phase: "selected", entries: [], activeId: "x", autoRevertAt: 0 },
        0,
      ),
    ).toBe("x");
  });

  it("targets activeId while connecting", () => {
    expect(
      resolveConnectTarget(
        { phase: "connecting", entries: [], activeId: "x" },
        0,
      ),
    ).toBe("x");
  });

  it("targets activeId in auto when there is no pending candidate", () => {
    expect(
      resolveConnectTarget(
        { phase: "auto", entries: [], activeId: "x", pending: null },
        0,
      ),
    ).toBe("x");
  });

  it("targets activeId before a pending candidate's settleAt", () => {
    const model = {
      phase: "auto" as const,
      entries: [],
      activeId: "x",
      pending: { candidateId: "y", countdownEndsAt: 500, settleAt: 1_000 },
    };
    expect(resolveConnectTarget(model, 999)).toBe("x");
  });

  it("targets the candidate at/after settleAt", () => {
    const model = {
      phase: "auto" as const,
      entries: [],
      activeId: "x",
      pending: { candidateId: "y", countdownEndsAt: 500, settleAt: 1_000 },
    };
    expect(resolveConnectTarget(model, 1_000)).toBe("y");
    expect(resolveConnectTarget(model, 1_500)).toBe("y");
  });
});

describe("currentDisplayId", () => {
  it("is null while uninitialized", () => {
    expect(currentDisplayId({ phase: "uninitialized" })).toBeNull();
  });

  it("follows activeId in auto, ignoring an in-flight pending candidate", () => {
    expect(
      currentDisplayId({
        phase: "auto",
        entries: [],
        activeId: "x",
        pending: null,
      }),
    ).toBe("x");
    expect(
      currentDisplayId({
        phase: "auto",
        entries: [],
        activeId: "x",
        pending: { candidateId: "y", countdownEndsAt: 0, settleAt: 0 },
      }),
    ).toBe("x");
  });

  it("follows activeId in selected and connecting", () => {
    expect(
      currentDisplayId({
        phase: "selected",
        entries: [],
        activeId: "x",
        autoRevertAt: 0,
      }),
    ).toBe("x");
    expect(
      currentDisplayId({ phase: "connecting", entries: [], activeId: "x" }),
    ).toBe("x");
  });
});
