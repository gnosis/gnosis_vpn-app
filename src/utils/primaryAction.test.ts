import { describe, expect, it, vi } from "vitest";
import type { AppState } from "@src/stores/appStore.ts";
import type {
  DestinationState,
  RouteHealthView,
} from "@src/services/vpnService.ts";
import {
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
  weakRouteHealth,
} from "@src/testing/destinations.ts";
import { primaryActionEnabled, runPrimaryAction } from "./primaryAction.ts";

vi.mock("@src/utils/appLog.ts", () => ({ logError: vi.fn() }));

const BASE_APP_STATE: AppState = {
  currentScreen: "main" as AppState["currentScreen"],
  serviceInfo: null,
  availableDestinations: [],
  destinations: {},
  connected: null,
  connecting: null,
  reconnecting: null,
  disconnecting: [],
  probe: null,
  isLoading: false,
  runMode: null,
  vpnStatus: "Disconnected",
  warmupStatus: "",
  syncProgress: 0,
  syncRecoveryReason: null,
  isUpdateAvailable: false,
  availableVersion: null,
  endOfLife: null,
  targetDestination: null,
  balance: null,
  packageVersion: null,
  toolkit: { status: "unknown", version: null, packageVersion: null },
  mode: {
    entries: {},
    sequence: [],
    active: null,
    mode: { mode: "auto", pending: null },
    listOpen: false,
    dragging: false,
    nextKey: 0,
    preferredLocation: null,
    lastConnectedDestination: null,
    connectOnStartup: false,
  },
};

function withActive(routeHealth: RouteHealthView | null): AppState {
  const state: DestinationState = {
    destination: makeDestination(),
    route_health: routeHealth,
  };
  return {
    ...BASE_APP_STATE,
    destinations: { "dest-1": state },
    mode: { ...BASE_APP_STATE.mode, active: "dest-1" },
  };
}

function actions() {
  return {
    connect: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(() => Promise.resolve()),
  };
}

describe("primaryActionEnabled", () => {
  it("is off while loading, even for a ready destination", () => {
    const state = { ...withActive(eligibleRouteHealth()), isLoading: true };
    expect(primaryActionEnabled(state)).toBe(false);
  });

  it("is on for a ready destination", () => {
    expect(primaryActionEnabled(withActive(eligibleRouteHealth()))).toBe(true);
  });

  it("is on for a weak route the user picked", () => {
    expect(primaryActionEnabled(withActive(weakRouteHealth()))).toBe(true);
  });

  it("is off without a route or without a destination", () => {
    expect(primaryActionEnabled(withActive(noPathRouteHealth()))).toBe(false);
    expect(primaryActionEnabled(withActive(null))).toBe(false);
    expect(primaryActionEnabled(BASE_APP_STATE)).toBe(false);
  });

  it.each(["Connected", "Connecting", "Reconnecting"])(
    "is on while %s, whatever the destination",
    (vpnStatus) => {
      expect(primaryActionEnabled({ ...BASE_APP_STATE, vpnStatus })).toBe(true);
    },
  );
});

describe("runPrimaryAction", () => {
  it("connects to the active destination while idle", async () => {
    const a = actions();
    await runPrimaryAction(withActive(eligibleRouteHealth()), a);
    expect(a.connect).toHaveBeenCalledWith("dest-1");
    expect(a.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects while a tunnel or attempt is active", async () => {
    const a = actions();
    await runPrimaryAction({ ...BASE_APP_STATE, vpnStatus: "Connecting" }, a);
    expect(a.disconnect).toHaveBeenCalled();
    expect(a.connect).not.toHaveBeenCalled();
  });

  it("does nothing without an active destination", async () => {
    const a = actions();
    await runPrimaryAction(BASE_APP_STATE, a);
    expect(a.connect).not.toHaveBeenCalled();
    expect(a.disconnect).not.toHaveBeenCalled();
  });

  it("swallows a failing action", async () => {
    const a = actions();
    a.connect.mockRejectedValueOnce(new Error("boom"));
    await expect(runPrimaryAction(withActive(eligibleRouteHealth()), a))
      .resolves.toBeUndefined();
  });
});
