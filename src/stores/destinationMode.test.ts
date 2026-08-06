import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import {
  createDestinationMode,
  createDestinationOrder,
  currentDisplayId,
  type ModeAppState,
  type ModeSettingsState,
  type ModeUiState,
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
  uiOverrides: Partial<ModeUiState> = {},
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
  const [ui, setUi] = createStore<ModeUiState>({
    viewingLatest: true,
    ...uiOverrides,
  });

  const mode = createRoot((dispose) => {
    disposeFns.push(dispose);
    return createDestinationMode(appState, settings, ui);
  });

  return { appState, setAppState, settings, setSettings, ui, setUi, mode };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  disposeFns.splice(0).forEach((d) => d());
  vi.useRealTimers();
});

describe("startup", () => {
  it("falls back to auto with an immediate, uncounted first pick when nothing else applies", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { mode, setAppState } = setup();

    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    expect(mode[0]).toMatchObject({
      kind: "auto",
      current: "fast",
      pending: null,
    });
  });

  it("starts in selected with the persisted last-connected destination when known", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const last = { ...BASE_DESTINATION, id: "last" };
    const { mode, setAppState } = setup(
      {},
      { lastConnectedDestination: "last" },
    );

    setAppState("availableDestinations", [fast, last]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 10_000_000),
      last: makeReadyToConnect("last", 500_000_000),
    });
    await Promise.resolve();

    expect(mode[0]).toMatchObject({ kind: "selected", id: "last" });
  });

  it("prefers a ready preferred location over the persisted last-connected destination, consuming the promotion", async () => {
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const last = { ...BASE_DESTINATION, id: "last" };
    const { mode, setAppState } = setup({}, {
      preferredLocation: "preferred",
      lastConnectedDestination: "last",
    });

    setAppState("availableDestinations", [preferred, last]);
    setAppState("destinations", {
      preferred: makeReadyToConnect("preferred"),
      last: makeReadyToConnect("last"),
    });
    await Promise.resolve();

    expect(mode[0]).toMatchObject({ kind: "selected", id: "preferred" });
  });

  it("live connection wins over everything, including a ready preferred location", async () => {
    const stale = { ...BASE_DESTINATION, id: "stale" };
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const { mode, setAppState } = setup(
      { connected: { destination_id: "stale", since: 0 } },
      { preferredLocation: "preferred" },
    );

    setAppState("availableDestinations", [stale, preferred]);
    setAppState("destinations", {
      stale: makeReadyToConnect("stale"),
      preferred: makeReadyToConnect("preferred"),
    });
    await Promise.resolve();

    expect(mode[0]).toMatchObject({ kind: "active", id: "stale" });
  });
});

describe("auto loop", () => {
  function setupInAuto() {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const ctx = setup();
    ctx.setAppState("availableDestinations", [fast]);
    ctx.setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
    });
    return { ...ctx, fast };
  }

  it("schedules a pending candidate when a better one appears", async () => {
    const { mode, setAppState, fast } = setupInAuto();
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "auto", current: "fast" });

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();

    expect(mode[0].kind).toBe("auto");
    if (mode[0].kind !== "auto") throw new Error("unreachable");
    expect(mode[0].current).toBe("fast");
    expect(mode[0].pending?.candidateId).toBe("better");
    expect(mode[0].pending?.countdownEndsAt).toBe(
      Date.now() + SWITCH_COUNTDOWN_MS,
    );
    expect(mode[0].pending?.settleAt).toBe(Date.now() + SETTLE_MS);
    expect(mode[0].pending?.settleAt).toBe(
      mode[0].pending!.countdownEndsAt + SWITCH_CROSSOVER_MS,
    );
  });

  it("cancels the pending candidate if it reverts to current before settling", async () => {
    const { mode, setAppState, fast } = setupInAuto();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ pending: { candidateId: "better" } });

    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeUnavailable("better"),
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({
      kind: "auto",
      current: "fast",
      pending: null,
    });

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(mode[0]).toMatchObject({ kind: "auto", current: "fast" });
  });

  it("commits at settleAt, and the loop keeps detecting further candidates", async () => {
    const { mode, setAppState, fast } = setupInAuto();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(mode[0]).toMatchObject({
      kind: "auto",
      current: "better",
      pending: null,
    });

    const best = { ...BASE_DESTINATION, id: "best" };
    setAppState("availableDestinations", [fast, better, best]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
      best: makeReadyToConnect("best", 1_000_000),
    });
    await Promise.resolve();

    expect(mode[0]).toMatchObject({ pending: { candidateId: "best" } });
  });
});

describe("viewingLatest pause", () => {
  it("does not detect a new candidate while viewingLatest is false", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { mode, setAppState, setUi } = setup({}, {}, {
      viewingLatest: false,
    });
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "auto", current: "fast" });

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({
      kind: "auto",
      current: "fast",
      pending: null,
    });

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(mode[0]).toMatchObject({ kind: "auto", current: "fast" });

    setUi("viewingLatest", true);
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ pending: { candidateId: "better" } });
  });

  it("cancels an in-flight pending candidate the moment viewingLatest turns false", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const better = { ...BASE_DESTINATION, id: "better" };
    const { mode, setAppState, setUi } = setup();
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
    expect(mode[0]).toMatchObject({ pending: { candidateId: "better" } });

    setUi("viewingLatest", false);
    await Promise.resolve();
    expect(mode[0]).toMatchObject({
      kind: "auto",
      current: "fast",
      pending: null,
    });

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(mode[0]).toMatchObject({ kind: "auto", current: "fast" });
  });
});

describe("preferred promotion", () => {
  it("promotes to selected exactly once per run, even across a later becomes-ready cycle", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const { mode, setAppState } = setup({}, { preferredLocation: "preferred" });

    setAppState("availableDestinations", [fast, preferred]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeUnavailable("preferred"),
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "auto", current: "fast" });

    // preferred becomes ready -> pending, then commits and promotes.
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeReadyToConnect("preferred"),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(mode[0]).toMatchObject({ kind: "selected", id: "preferred" });

    // selected("preferred") matches best -> auto-revert fires after 5s.
    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);
    expect(mode[0]).toMatchObject({ kind: "auto", current: "preferred" });

    // preferred flips unready, then ready again -> a second becomes-ready
    // commit updates `current` normally but must not promote again.
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeUnavailable("preferred"),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(mode[0]).toMatchObject({ kind: "auto", current: "fast" });

    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      preferred: makeReadyToConnect("preferred"),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(mode[0]).toMatchObject({ kind: "auto", current: "preferred" });
  });
});

describe("manual selection", () => {
  function setupWithTwoCards() {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const other = { ...BASE_DESTINATION, id: "other" };
    const ctx = setup();
    ctx.setAppState("availableDestinations", [fast, other]);
    ctx.setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      other: makeReadyToConnect("other"),
    });
    return { ...ctx, fast, other };
  }

  it("selectDestination from auto lands in selected and clears any pending candidate", async () => {
    const { mode, setAppState, fast } = setupWithTwoCards();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      other: makeReadyToConnect("other"),
      better: makeReadyToConnect("better", 1_000_000),
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ pending: { candidateId: "better" } });

    mode[1].selectDestination("other");
    expect(mode[0]).toMatchObject({ kind: "selected", id: "other" });
    if (mode[0].kind !== "selected") throw new Error("unreachable");
    expect(mode[0].autoRevertAt).not.toBeNull();

    // The cancelled pending candidate's timer must not fire later, and the
    // manual grace period hasn't elapsed yet either.
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(mode[0]).toMatchObject({ kind: "selected", id: "other" });
  });

  it("selectDestination from selected(other) moves to the newly selected id", async () => {
    const { mode } = setupWithTwoCards();
    await Promise.resolve();

    mode[1].selectDestination("other");
    expect(mode[0]).toMatchObject({ kind: "selected", id: "other" });

    mode[1].selectDestination("fast");
    expect(mode[0]).toMatchObject({ kind: "selected", id: "fast" });
  });

  it("is a no-op while active", async () => {
    const { mode, setAppState } = setupWithTwoCards();
    await Promise.resolve();

    setAppState("connecting", {
      destination_id: "fast",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "active", id: "fast" });

    mode[1].selectDestination("other");
    expect(mode[0]).toMatchObject({ kind: "active", id: "fast" });
  });
});

describe("manual selection auto-revert", () => {
  it("starts an unconditional grace timer regardless of whether the pick matches the auto best", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const other = { ...BASE_DESTINATION, id: "other" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [fast, other]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 10_000_000), // best auto pick
      other: makeReadyToConnect("other", 500_000_000),
    });
    await Promise.resolve();

    mode[1].selectDestination("other");
    expect(mode[0]).toMatchObject({ kind: "selected", id: "other" });
    if (mode[0].kind !== "selected") throw new Error("unreachable");
    expect(mode[0].autoRevertAt).toBe(Date.now() + SELECTED_AUTO_REVERT_MS);
  });

  it("reverts to auto once the grace period elapses, even for a pick that never matched the best candidate", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const slow = { ...BASE_DESTINATION, id: "slow" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [fast, slow]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 10_000_000),
      slow: makeReadyToConnect("slow", 500_000_000),
    });
    await Promise.resolve();

    mode[1].selectDestination("slow");
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "selected", id: "slow" });

    // Reverts to auto with "slow" as current — since "fast" is the better
    // auto pick, the auto loop immediately starts its own pending countdown
    // toward it, on top of (not instead of) the revert we're testing here.
    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    expect(mode[0]).toMatchObject({
      kind: "auto",
      current: "slow",
      pending: { candidateId: "fast" },
    });
  });

  it("restarts the grace timer on a fresh manual pick, cancelling the earlier one", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const other = { ...BASE_DESTINATION, id: "other" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [fast, other]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      other: makeReadyToConnect("other"),
    });
    await Promise.resolve();

    mode[1].selectDestination("other");
    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS - 1_000);
    mode[1].selectDestination("fast");
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "selected", id: "fast" });

    // The cancelled "other" timer must not fire and flip things later.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mode[0]).toMatchObject({ kind: "selected", id: "fast" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS - 1_000);
    expect(mode[0]).toMatchObject({
      kind: "auto",
      current: "fast",
      pending: null,
    });
  });

  it("connecting during the grace window cancels the pending revert", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    mode[1].selectDestination("fast");
    await Promise.resolve();

    setAppState("connecting", {
      destination_id: "fast",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "active", id: "fast" });

    await vi.advanceTimersByTimeAsync(SELECTED_AUTO_REVERT_MS);
    expect(mode[0]).toMatchObject({ kind: "active", id: "fast" });
  });
});

describe("non-manual selected auto-revert", () => {
  it("still reverts to auto when a non-manual selected id matches the best pick for a sustained 5s (e.g. after a disconnect)", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    setAppState("connected", { destination_id: "fast", since: 0 });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "active", id: "fast" });

    setAppState("connected", null);
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "selected", id: "fast" });

    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);
    expect(mode[0]).toMatchObject({
      kind: "auto",
      current: "fast",
      pending: null,
    });
  });
});

describe("resolveConnectTarget", () => {
  it("targets the selected id", () => {
    expect(
      resolveConnectTarget(
        { kind: "selected", id: "x", autoRevertAt: null },
        0,
      ),
    ).toBe("x");
  });

  it("targets the active id", () => {
    expect(resolveConnectTarget({ kind: "active", id: "x" }, 0)).toBe("x");
  });

  it("targets current when auto has no pending candidate", () => {
    expect(
      resolveConnectTarget({ kind: "auto", current: "x", pending: null }, 0),
    ).toBe("x");
  });

  it("targets current before a pending candidate's settleAt", () => {
    const mode = {
      kind: "auto" as const,
      current: "x",
      pending: { candidateId: "y", countdownEndsAt: 500, settleAt: 1_000 },
    };
    expect(resolveConnectTarget(mode, 999)).toBe("x");
  });

  it("targets the candidate at/after settleAt", () => {
    const mode = {
      kind: "auto" as const,
      current: "x",
      pending: { candidateId: "y", countdownEndsAt: 500, settleAt: 1_000 },
    };
    expect(resolveConnectTarget(mode, 1_000)).toBe("y");
    expect(resolveConnectTarget(mode, 1_500)).toBe("y");
  });
});

describe("active / disconnect", () => {
  it("connecting to a destination from auto enters active", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();
    expect(mode[0].kind).toBe("auto");

    setAppState("connecting", {
      destination_id: "fast",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "active", id: "fast" });
  });

  it("connecting to a destination from selected enters active", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();
    mode[1].selectDestination("fast");
    await Promise.resolve();

    setAppState("connected", { destination_id: "fast", since: 0 });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "active", id: "fast" });
  });

  it("lands on selected with the last active id once nothing is connecting/connected/reconnecting, even while disconnecting is still populated", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    setAppState("connected", { destination_id: "fast", since: 0 });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "active", id: "fast" });

    setAppState("connected", null);
    await Promise.resolve();

    expect(mode[0]).toMatchObject({ kind: "selected", id: "fast" });
  });

  it("retargets in place while already active, with no interstitial mode", async () => {
    const a = { ...BASE_DESTINATION, id: "a" };
    const b = { ...BASE_DESTINATION, id: "b" };
    const { mode, setAppState } = setup();
    setAppState("availableDestinations", [a, b]);
    setAppState("destinations", {
      a: makeReadyToConnect("a"),
      b: makeReadyToConnect("b"),
    });
    setAppState("connected", { destination_id: "a", since: 0 });
    await Promise.resolve();
    expect(mode[0]).toMatchObject({ kind: "active", id: "a" });

    setAppState("connected", null);
    setAppState("connecting", {
      destination_id: "b",
      since: 0,
      phase: "Init",
    });
    await Promise.resolve();

    expect(mode[0]).toMatchObject({ kind: "active", id: "b" });
  });
});

describe("currentDisplayId", () => {
  it("follows current in auto, ignoring an in-flight pending candidate", () => {
    expect(
      currentDisplayId({ kind: "auto", current: "x", pending: null }),
    ).toBe("x");
    expect(
      currentDisplayId({
        kind: "auto",
        current: "x",
        pending: { candidateId: "y", countdownEndsAt: 0, settleAt: 0 },
      }),
    ).toBe("x");
  });

  it("follows id in selected and active", () => {
    expect(
      currentDisplayId({ kind: "selected", id: "x", autoRevertAt: null }),
    ).toBe("x");
    expect(currentDisplayId({ kind: "active", id: "x" })).toBe("x");
  });
});

describe("createDestinationOrder", () => {
  function setupWithOrder(
    appOverrides: Partial<ModeAppState> = {},
    settingsOverrides: Partial<ModeSettingsState> = {},
  ) {
    const ctx = setup(appOverrides, settingsOverrides);
    const order = createRoot((dispose) => {
      disposeFns.push(dispose);
      return createDestinationOrder(ctx.mode[0], ctx.mode[1]);
    });
    return { ...ctx, order };
  }

  it("appends the very first displayed id", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { setAppState, order } = setupWithOrder();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    expect(order[0].order).toEqual(["fast"]);
  });

  it("animates an auto-driven change", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const better = { ...BASE_DESTINATION, id: "better" };
    const { setAppState, order } = setupWithOrder();
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
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(order[0]).toMatchObject({
      order: ["fast", "better"],
      animate: true,
    });
  });

  it("does not animate a destination picked directly via selectDestination", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const other = { ...BASE_DESTINATION, id: "other" };
    const { setAppState, order } = setupWithOrder();
    setAppState("availableDestinations", [fast, other]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      other: makeReadyToConnect("other"),
    });
    await Promise.resolve();

    order[1].selectDestination("other");
    await Promise.resolve();

    expect(order[0]).toMatchObject({
      order: ["fast", "other"],
      animate: false,
    });
  });

  it("dedups and moves a reselected historic id to the newest slot", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const other = { ...BASE_DESTINATION, id: "other" };
    const { setAppState, order } = setupWithOrder();
    setAppState("availableDestinations", [fast, other]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      other: makeReadyToConnect("other"),
    });
    await Promise.resolve();

    order[1].selectDestination("other");
    await Promise.resolve();
    expect(order[0].order).toEqual(["fast", "other"]);

    order[1].selectDestination("fast");
    await Promise.resolve();

    expect(order[0]).toMatchObject({
      order: ["other", "fast"],
      animate: false,
    });
  });

  it("still animates once a manual pick's matching display change only happens later (retarget while active)", async () => {
    const a = { ...BASE_DESTINATION, id: "a" };
    const b = { ...BASE_DESTINATION, id: "b" };
    const { setAppState, order } = setupWithOrder();
    setAppState("availableDestinations", [a, b]);
    setAppState("destinations", {
      a: makeReadyToConnect("a"),
      b: makeReadyToConnect("b"),
    });
    setAppState("connected", { destination_id: "a", since: 0 });
    await Promise.resolve();
    expect(order[0].order).toEqual(["a"]);

    // Picking "b" from the list while already active: selectDestination is a
    // no-op on mode itself (still active("a")) until the backend actually
    // reports connecting to "b" — the manual intent must survive that gap.
    order[1].selectDestination("b");
    await Promise.resolve();
    expect(order[0].order).toEqual(["a"]);

    setAppState("connected", null);
    setAppState("connecting", { destination_id: "b", since: 0, phase: "Init" });
    await Promise.resolve();

    expect(order[0]).toMatchObject({ order: ["a", "b"], animate: false });
  });
});
