import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

// bannerStore.ts's module-scope singleton wires up the real appStore/
// settingsStore, which transitively call Tauri window/event/core APIs at
// import time — stub them so importing the module under test doesn't
// require a real webview. The tests below only exercise createBannerStore
// with injected fakes, never the singleton itself.
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main" }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import {
  type BannerAppState,
  type BannerSettingsState,
  createBannerStore,
  SWITCH_COUNTDOWN_MS,
} from "./bannerStore.ts";

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
  appOverrides: Partial<BannerAppState> = {},
  settingsOverrides: Partial<BannerSettingsState> = {},
  { startVisible = true }: { startVisible?: boolean } = {},
) {
  const [appState, setAppState] = createStore<BannerAppState>({
    availableDestinations: [],
    destinations: {},
    vpnStatus: "Disconnected",
    connected: null,
    connecting: null,
    reconnecting: null,
    ...appOverrides,
  });
  const [settings, setSettings] = createStore<BannerSettingsState>({
    preferredLocation: null,
    lastConnectedDestination: null,
    ...settingsOverrides,
  });

  const banner = createRoot((dispose) => {
    disposeFns.push(dispose);
    return createBannerStore(appState, settings);
  });
  // Mirrors LocationBanner's onMount — every existing test exercises
  // behavior from the moment the banner is on screen, matching real usage.
  // Tests targeting the pre-visible gating itself opt out via startVisible.
  if (startVisible) banner[1].markVisible();

  return { appState, setAppState, settings, setSettings, banner };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  disposeFns.splice(0).forEach((d) => d());
  vi.useRealTimers();
});

describe("bannerStore initialization", () => {
  it("stays uninitialized until the first destinations batch arrives", async () => {
    const { banner } = setup();
    await Promise.resolve();
    expect(banner[0].activeId).toBeNull();
    expect(banner[0].order).toEqual([]);
  });

  it("picks the lowest-latency ready destination on first-ever startup", async () => {
    const slow = { ...BASE_DESTINATION, id: "slow" };
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { banner, setAppState } = setup();

    setAppState("availableDestinations", [slow, fast]);
    setAppState("destinations", {
      slow: makeReadyToConnect("slow", 100_000_000),
      fast: makeReadyToConnect("fast", 20_000_000),
    });
    await Promise.resolve();

    expect(banner[0].activeId).toBe("fast");
    expect(banner[0].order).toEqual(["fast"]);
  });

  it("prefers the ready preferred location over lowest latency on first-ever startup", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const { banner, setAppState } = setup({}, {
      preferredLocation: "preferred",
    });

    setAppState("availableDestinations", [fast, preferred]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 10_000_000),
      preferred: makeReadyToConnect("preferred", 200_000_000),
    });
    await Promise.resolve();

    expect(banner[0].activeId).toBe("preferred");
  });

  it("starts from the last-connected destination on a subsequent run", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const lastConnected = { ...BASE_DESTINATION, id: "lastConnected" };
    const { banner, setAppState } = setup(
      {},
      { lastConnectedDestination: "lastConnected" },
    );

    setAppState("availableDestinations", [fast, lastConnected]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 10_000_000),
      lastConnected: makeReadyToConnect("lastConnected", 200_000_000),
    });
    await Promise.resolve();

    expect(banner[0].activeId).toBe("lastConnected");
  });

  it("falls back to the best candidate when the last-connected destination is unknown", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { banner, setAppState } = setup(
      {},
      { lastConnectedDestination: "gone" },
    );

    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    expect(banner[0].activeId).toBe("fast");
  });

  it("prefers the live backend connection over the persisted last-connected id", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const stale = { ...BASE_DESTINATION, id: "stale" };
    const { banner, setAppState } = setup(
      { connected: { destination_id: "stale", since: 0 } },
      { lastConnectedDestination: "fast" },
    );

    setAppState("availableDestinations", [fast, stale]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast"),
      stale: makeReadyToConnect("stale"),
    });
    await Promise.resolve();

    expect(banner[0].activeId).toBe("stale");
  });
});

describe("bannerStore visibility gating", () => {
  it("does nothing before markVisible, even once destinations arrive", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { banner, setAppState } = setup({}, {}, { startVisible: false });

    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    expect(banner[0].activeId).toBeNull();
    expect(banner[0].order).toEqual([]);
    expect(banner[0].initialized).toBe(false);
  });

  it("picks the current best destination at the moment markVisible is called, not one from before it was seen", async () => {
    const slow = { ...BASE_DESTINATION, id: "slow" };
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { banner, setAppState } = setup({}, {}, { startVisible: false });

    // "slow" is the only, best-so-far candidate while the banner is still
    // behind an earlier screen the user hasn't seen yet.
    setAppState("availableDestinations", [slow]);
    setAppState("destinations", {
      slow: makeReadyToConnect("slow", 500_000_000),
    });
    await Promise.resolve();
    expect(banner[0].activeId).toBeNull();

    // A strictly better destination shows up before the banner is ever visible.
    setAppState("availableDestinations", [slow, fast]);
    setAppState("destinations", {
      slow: makeReadyToConnect("slow", 500_000_000),
      fast: makeReadyToConnect("fast", 10_000_000),
    });
    await Promise.resolve();
    expect(banner[0].activeId).toBeNull();

    // Only once the main screen actually shows should the current best be
    // picked — "fast" outright, with no leftover countdown from "slow".
    banner[1].markVisible();
    await Promise.resolve();

    expect(banner[0].activeId).toBe("fast");
    expect(banner[0].order).toEqual(["fast"]);
    expect(banner[0].pendingCandidateId).toBeNull();
    expect(banner[0].countdownEndsAt).toBeNull();
  });

  it("preserves visibility across reset, since LocationBanner won't remount to call markVisible again", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const { banner, setAppState } = setup();
    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();
    expect(banner[0].activeId).toBe("fast");

    setAppState("availableDestinations", []);
    banner[1].reset();

    setAppState("availableDestinations", [fast]);
    setAppState("destinations", { fast: makeReadyToConnect("fast") });
    await Promise.resolve();

    expect(banner[0].activeId).toBe("fast");
  });
});

describe("bannerStore candidate detection + countdown", () => {
  function setupInitialized() {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const ctx = setup();
    ctx.setAppState("availableDestinations", [fast]);
    ctx.setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
    });
    return { ...ctx, fast };
  }

  it("starts a countdown when a strictly better destination appears", async () => {
    const { banner, setAppState, fast } = setupInitialized();
    await Promise.resolve();
    expect(banner[0].activeId).toBe("fast");

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();

    expect(banner[0].pendingCandidateId).toBe("better");
    expect(banner[0].countdownEndsAt).not.toBeNull();
    expect(banner[0].activeId).toBe("fast");
  });

  it("appends and activates the candidate once the countdown expires", async () => {
    const { banner, setAppState, fast } = setupInitialized();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);

    expect(banner[0].activeId).toBe("better");
    expect(banner[0].order).toEqual(["fast", "better"]);
    expect(banner[0].pendingCandidateId).toBeNull();
    expect(banner[0].countdownEndsAt).toBeNull();
  });

  it("triggers a switch when the preferred location becomes ready, even if it is not lower latency", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const preferred = { ...BASE_DESTINATION, id: "preferred" };
    const { banner, setAppState } = setup(
      {},
      { preferredLocation: "preferred" },
    );

    setAppState("availableDestinations", [fast, preferred]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      preferred: makeUnavailable("preferred"),
    });
    await Promise.resolve();
    // preferred isn't ready yet, so startup falls back to the best candidate
    expect(banner[0].activeId).toBe("fast");

    // preferred becomes ready, with a HIGHER latency than the active one
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      preferred: makeReadyToConnect("preferred", 500_000_000),
    });
    await Promise.resolve();

    expect(banner[0].pendingCandidateId).toBe("preferred");
  });

  it("cancels the countdown if the candidate stops being better before it expires", async () => {
    const { banner, setAppState, fast } = setupInitialized();
    await Promise.resolve();

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();
    expect(banner[0].pendingCandidateId).toBe("better");

    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeUnavailable("better"),
    });
    await Promise.resolve();

    expect(banner[0].pendingCandidateId).toBeNull();
    expect(banner[0].countdownEndsAt).toBeNull();

    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);
    expect(banner[0].activeId).toBe("fast");
  });

  it("freezes detection entirely while connected/connecting/reconnecting", async () => {
    const { banner, setAppState, fast } = setupInitialized();
    await Promise.resolve();

    setAppState("vpnStatus", "Connected");
    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();

    expect(banner[0].pendingCandidateId).toBeNull();

    await vi.advanceTimersByTimeAsync(SWITCH_COUNTDOWN_MS);
    expect(banner[0].activeId).toBe("fast");

    setAppState("vpnStatus", "Disconnected");
    await Promise.resolve();

    expect(banner[0].pendingCandidateId).toBe("better");
  });

  it("pauses detection while the user is not viewing the latest card", async () => {
    const { banner, setAppState, fast } = setupInitialized();
    await Promise.resolve();

    banner[1].noteViewingLatest(false);

    const better = { ...BASE_DESTINATION, id: "better" };
    setAppState("availableDestinations", [fast, better]);
    setAppState("destinations", {
      fast: makeReadyToConnect("fast", 100_000_000),
      better: makeReadyToConnect("better", 10_000_000),
    });
    await Promise.resolve();

    expect(banner[0].pendingCandidateId).toBeNull();

    banner[1].noteViewingLatest(true);
    await Promise.resolve();

    expect(banner[0].pendingCandidateId).toBe("better");
  });
});

describe("bannerStore.setActiveId", () => {
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

  it("manually selecting the latest card keeps viewingLatest true", async () => {
    const { banner } = setupWithTwoCards();
    await Promise.resolve();
    expect(banner[0].activeId).toBe("fast");

    banner[1].setActiveId("fast");

    expect(banner[0].viewingLatest).toBe(true);
  });

  it("inserts a not-yet-seen card into order and treats it as latest", async () => {
    const { banner } = setupWithTwoCards();
    await Promise.resolve();

    banner[1].setActiveId("other");

    expect(banner[0].activeId).toBe("other");
    expect(banner[0].order).toEqual(["fast", "other"]);
    expect(banner[0].viewingLatest).toBe(true);
  });

  it("reselecting an older card drops its stale spot and moves it to the end", async () => {
    const { banner } = setupWithTwoCards();
    await Promise.resolve();
    expect(banner[0].activeId).toBe("fast");

    // "other" enters the trail (e.g. picked from the browse-all list) and becomes latest.
    banner[1].setActiveId("other");
    expect(banner[0].order).toEqual(["fast", "other"]);

    // Reselecting "fast" makes it the new latest again — its earlier spot
    // in the trail is dropped rather than left behind as a duplicate.
    banner[1].setActiveId("fast");

    expect(banner[0].activeId).toBe("fast");
    expect(banner[0].order).toEqual(["other", "fast"]);
    expect(banner[0].viewingLatest).toBe(true);
  });

  it("re-proposes a countdown after reselecting the current latest card, since auto-follow stays active", async () => {
    const fast = { ...BASE_DESTINATION, id: "fast" };
    const better = { ...BASE_DESTINATION, id: "better" };
    const { banner, setAppState } = setup();
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
    expect(banner[0].pendingCandidateId).toBe("better");

    // "fast" is still the latest order entry, so this doesn't pause auto-follow —
    // the still-better "better" candidate is legitimately re-proposed right away.
    banner[1].setActiveId("fast");

    expect(banner[0].pendingCandidateId).toBe("better");
  });
});

describe("bannerStore.reset", () => {
  it("clears all state back to uninitialized when the underlying destinations are also cleared", async () => {
    const { banner, setAppState } = setupInitializedHelper();
    await Promise.resolve();
    expect(banner[0].activeId).not.toBeNull();

    // Mirrors appStore's own reset flow (e.g. criticalError), which clears
    // availableDestinations/destinations alongside resetting the banner —
    // otherwise the init effect would just immediately re-derive the same
    // pick from the still-present data.
    setAppState("availableDestinations", []);
    banner[1].reset();

    expect(banner[0]).toMatchObject({
      order: [],
      activeId: null,
      viewingLatest: true,
      pendingCandidateId: null,
      countdownEndsAt: null,
      initialized: false,
    });
  });
});

function setupInitializedHelper() {
  const fast = { ...BASE_DESTINATION, id: "fast" };
  const ctx = setup();
  ctx.setAppState("availableDestinations", [fast]);
  ctx.setAppState("destinations", { fast: makeReadyToConnect("fast") });
  return ctx;
}
