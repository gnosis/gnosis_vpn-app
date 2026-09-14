import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DestinationState,
  RouteHealthState,
  RunMode,
  StatusResponse,
} from "@src/services/vpnService.ts";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main" }),
}));

import { AppScreen, createScreenSelector } from "./screenSelector.ts";

const RUNNING: RunMode = {
  Running: { funding_status: null, hopr_status: null },
};
const WARMUP: RunMode = {
  Warmup: { status: "StartingNode", last_error: null },
};
const DEPLOYING_SAFE: RunMode = { DeployingSafe: { node_address: "0xnode" } };
const PREPARING_SAFE: RunMode = {
  PreparingSafe: {
    node_address: "0xnode",
    node_xdai: 0n,
    node_wxhopr: 0n,
    funding_tool: null,
    error: null,
    balance_recommendation: null,
  },
};

const READY: RouteHealthState = {
  state: "ReadyToConnect",
  exit: {
    checked_at: 0,
    versions: { versions: ["v1"], latest: "v1" },
    ping_rtt: 42,
    health: {
      slots: { total: 10, available: 10, connected: 0 },
      load_avg: { one: 0.1, five: 0.2, fifteen: 0.3, nproc: 4 },
    },
  },
};
const DEGRADED: RouteHealthState = {
  state: "NeedsPeering",
  has_channel: false,
};

function destination(state: RouteHealthState): DestinationState {
  return {
    destination: {
      id: "dest-1",
      meta: { location: "Brazil" },
      address: "0xexit",
      routing: 1,
    },
    route_health: {
      state,
      last_error: null,
      checking_since: null,
      consecutive_failures: 0,
    },
  };
}

function status(
  run_mode: RunMode,
  destinations: DestinationState[] = [],
): StatusResponse {
  return {
    run_mode,
    destinations,
    target_destination: null,
    connected: null,
    connecting: null,
    reconnecting: null,
    disconnecting: [],
  };
}

describe("createScreenSelector", () => {
  let screenOf: (s: StatusResponse) => AppScreen;

  beforeEach(() => {
    const select = createScreenSelector();
    screenOf = (s) => select(s)[0];
  });

  it("syncs on the way to main while the daemon warms up", () => {
    expect(screenOf(status(WARMUP))).toBe(AppScreen.Synchronization);
  });

  it("syncs on the way to main while the safe is deploying", () => {
    expect(screenOf(status(DEPLOYING_SAFE))).toBe(AppScreen.Synchronization);
  });

  it("delays main while the only destination is still peering", () => {
    expect(screenOf(status(RUNNING, [destination(DEGRADED)]))).toBe(
      AppScreen.Synchronization,
    );
  });

  it("reaches main once a destination is ready", () => {
    expect(screenOf(status(RUNNING, [destination(READY)]))).toBe(
      AppScreen.Main,
    );
  });

  it("stays on main when the daemon warms up again", () => {
    expect(screenOf(status(RUNNING, [destination(READY)]))).toBe(
      AppScreen.Main,
    );
    expect(screenOf(status(WARMUP))).toBe(AppScreen.Main);
  });

  it("stays on main when every destination degrades", () => {
    expect(screenOf(status(RUNNING, [destination(READY)]))).toBe(
      AppScreen.Main,
    );
    expect(screenOf(status(RUNNING, [destination(DEGRADED)]))).toBe(
      AppScreen.Main,
    );
  });

  it("stays on main when the safe redeploys", () => {
    expect(screenOf(status(RUNNING, [destination(READY)]))).toBe(
      AppScreen.Main,
    );
    expect(screenOf(status(DEPLOYING_SAFE))).toBe(AppScreen.Main);
  });

  it("still syncs for the first warmup after the service was not running", () => {
    expect(screenOf(status("NotRunning"))).toBe(AppScreen.Main);
    expect(screenOf(status(WARMUP))).toBe(AppScreen.Synchronization);
  });

  it("keeps onboarding reachable after main", () => {
    expect(screenOf(status(RUNNING, [destination(READY)]))).toBe(
      AppScreen.Main,
    );
    expect(screenOf(status(PREPARING_SAFE))).toBe(AppScreen.Onboarding);
  });

  it("gives each app run its own gate", () => {
    expect(screenOf(status(RUNNING, [destination(READY)]))).toBe(
      AppScreen.Main,
    );
    expect(screenOf(status(WARMUP))).toBe(AppScreen.Main);
    const nextRun = createScreenSelector();
    expect(nextRun(status(WARMUP))[0]).toBe(AppScreen.Synchronization);
  });
});
