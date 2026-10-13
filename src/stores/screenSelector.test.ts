import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DestinationState,
  RouteHealthView,
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
import {
  checkedQuickProbe,
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
  weakRouteHealth,
} from "@src/testing/destinations.ts";

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

function failedSafeDeployment(
  funded: boolean,
): RunMode {
  return {
    PreparingSafe: {
      node_address: "0xnode",
      node_xdai: funded ? 10n : 0n,
      node_wxhopr: funded ? 10n : 0n,
      funding_tool: null,
      error: "deploy tx reverted",
      balance_recommendation: {
        wxhopr: 5n,
        xdai: 5n,
        channel_stakes: 0n,
        fee_to_start: 0n,
        txs_to_start: 0,
        xdai_fee_per_tx: 0n,
      },
    },
  };
}

function destination(route_health: RouteHealthView): DestinationState {
  return {
    destination: makeDestination({ meta: { location: "Brazil" } }),
    route_health,
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
    probe: null,
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

  it("delays main while the only destination has no route yet", () => {
    expect(screenOf(status(RUNNING, [destination(noPathRouteHealth())]))).toBe(
      AppScreen.Synchronization,
    );
  });

  it("reaches main once a weak route is connectable", () => {
    expect(screenOf(status(RUNNING, [destination(weakRouteHealth())]))).toBe(
      AppScreen.Main,
    );
  });

  it("keeps waiting while the only route leads to a full exit", () => {
    const full = {
      ...eligibleRouteHealth(),
      quick_probe: checkedQuickProbe({ total: 4, available: 0, connected: 4 }),
    };
    expect(screenOf(status(RUNNING, [destination(full)]))).toBe(
      AppScreen.Synchronization,
    );
  });

  it("reaches main once a destination is ready", () => {
    expect(screenOf(status(RUNNING, [destination(eligibleRouteHealth())])))
      .toBe(
        AppScreen.Main,
      );
  });

  it("stays on main when the daemon warms up again", () => {
    expect(screenOf(status(RUNNING, [destination(eligibleRouteHealth())])))
      .toBe(
        AppScreen.Main,
      );
    expect(screenOf(status(WARMUP))).toBe(AppScreen.Main);
  });

  it("stays on main when every destination loses its route", () => {
    expect(screenOf(status(RUNNING, [destination(eligibleRouteHealth())])))
      .toBe(
        AppScreen.Main,
      );
    expect(screenOf(status(RUNNING, [destination(noPathRouteHealth())]))).toBe(
      AppScreen.Main,
    );
  });

  it("stays on main when the safe redeploys", () => {
    expect(screenOf(status(RUNNING, [destination(eligibleRouteHealth())])))
      .toBe(
        AppScreen.Main,
      );
    expect(screenOf(status(DEPLOYING_SAFE))).toBe(AppScreen.Main);
  });

  it("still syncs for the first warmup after the service was not running", () => {
    expect(screenOf(status("NotRunning"))).toBe(AppScreen.Main);
    expect(screenOf(status(WARMUP))).toBe(AppScreen.Synchronization);
  });

  it("keeps onboarding reachable after main", () => {
    expect(screenOf(status(RUNNING, [destination(eligibleRouteHealth())])))
      .toBe(
        AppScreen.Main,
      );
    expect(screenOf(status(PREPARING_SAFE))).toBe(AppScreen.Onboarding);
  });

  it("keeps syncing while a failed safe deployment retries", () => {
    const select = createScreenSelector();
    select(status(DEPLOYING_SAFE));
    expect(select(status(failedSafeDeployment(true)))).toEqual([
      AppScreen.Synchronization,
      "Safe deployment failed, retrying",
      "deploy tx reverted",
    ]);
  });

  it("onboards after a failed safe deployment that needs funds", () => {
    screenOf(status(DEPLOYING_SAFE));
    expect(screenOf(status(failedSafeDeployment(false)))).toBe(
      AppScreen.Onboarding,
    );
  });

  it("onboards on a safe error before any deployment started", () => {
    expect(screenOf(status(failedSafeDeployment(true)))).toBe(
      AppScreen.Onboarding,
    );
  });

  it("reports the warmup error as the recovery reason", () => {
    const select = createScreenSelector();
    const failing: RunMode = {
      Warmup: {
        status: "StartingNode",
        last_error: "safe 0xabc does not exist",
      },
    };
    expect(select(status(failing))[2]).toBe("safe 0xabc does not exist");
    expect(select(status(WARMUP))[2]).toBeNull();
  });

  it("gives each app run its own gate", () => {
    expect(screenOf(status(RUNNING, [destination(eligibleRouteHealth())])))
      .toBe(
        AppScreen.Main,
      );
    expect(screenOf(status(WARMUP))).toBe(AppScreen.Main);
    const nextRun = createScreenSelector();
    expect(nextRun(status(WARMUP))[0]).toBe(AppScreen.Synchronization);
  });
});
