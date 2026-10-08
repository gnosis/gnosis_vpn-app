import { describe, expect, it } from "vitest";
import type {
  BalanceRecommendation,
  Destination,
  PreparingSafe,
  RouteHealthView,
  RunMode,
  StatusResponse,
} from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";
import {
  deriveVPNStatus,
  isConnected,
  isConnecting,
  isDisconnected,
  isDisconnecting,
  isSwitchingDestination,
  isWxHOPRTransferred,
  isXDAITransferred,
  waitingForRouteMessage,
} from "./status.ts";
import { makeDestination } from "@src/testing/destinations.ts";

const BASE: StatusResponse = {
  run_mode: "NotRunning",
  destinations: [],
  target_destination: null,
  connected: null,
  connecting: null,
  reconnecting: null,
  disconnecting: [],
  probe: null,
};

const CONNECTING_INFO = {
  destination_id: "dest-1",
  since: 0,
  phase: "Init" as const,
};

const DISCONNECTING_INFO = {
  destination_id: "dest-1",
  since: 0,
  phase: "Disconnecting" as const,
};

const RUNNING: RunMode = {
  Running: { funding_status: null, hopr_status: null },
};

// What the daemon sends once it reports a reconnect without a phase.
const PHASELESS_RECONNECTING_INFO = {
  destination_id: "dest-1",
  since: 0,
  phase: null,
};

const DESTINATION: Destination = makeDestination({
  meta: { location: "Brazil" },
});

const BASE_APP_STATE: AppState = {
  currentScreen: "initialization" as AppState["currentScreen"],
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
  vpnStatus: "ServiceUnavailable",
  warmupStatus: "",
  syncProgress: 0,
  syncRecoveryDeadline: null,
  isUpdateAvailable: false,
  availableVersion: null,
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

const BALANCE_RECOMMENDATION: BalanceRecommendation = {
  wxhopr: 100n,
  xdai: 50n,
  channel_stakes: 0n,
  fee_to_start: 0n,
  txs_to_start: 0,
  xdai_fee_per_tx: 0n,
};

const PREPARING_SAFE: PreparingSafe = {
  node_address: "0xnode",
  node_xdai: 0n,
  node_wxhopr: 0n,
  funding_tool: null,
  error: null,
  balance_recommendation: BALANCE_RECOMMENDATION,
};

function appStateWithPreparingSafe(preparingSafe: PreparingSafe): AppState {
  return {
    ...BASE_APP_STATE,
    runMode: { PreparingSafe: preparingSafe },
  };
}

describe("isConnected", () => {
  it("returns true when connected info is present", () => {
    expect(
      isConnected({
        ...BASE,
        connected: {
          destination_id: "dest-1",
          since: 0,
          tunnel_ping_rtt: null,
        },
      }),
    ).toBe(true);
  });

  it("returns false when connected is null", () => {
    expect(isConnected(BASE)).toBe(false);
  });
});

describe("isConnecting", () => {
  it("returns true when connecting info is present", () => {
    expect(isConnecting({ ...BASE, connecting: CONNECTING_INFO })).toBe(true);
  });

  it("returns false when connecting is null", () => {
    expect(isConnecting(BASE)).toBe(false);
  });
});

describe("isDisconnecting", () => {
  it("returns true when disconnecting list is non-empty", () => {
    expect(
      isDisconnecting({ ...BASE, disconnecting: [DISCONNECTING_INFO] }),
    ).toBe(true);
  });

  it("returns false when disconnecting list is empty", () => {
    expect(isDisconnecting(BASE)).toBe(false);
  });
});

describe("isDisconnected", () => {
  it("returns true when connected, connecting and disconnecting are all absent", () => {
    expect(isDisconnected(BASE)).toBe(true);
  });

  it("returns false when connected", () => {
    expect(
      isDisconnected({
        ...BASE,
        connected: {
          destination_id: "dest-1",
          since: 0,
          tunnel_ping_rtt: null,
        },
      }),
    ).toBe(false);
  });

  it("returns false when connecting", () => {
    expect(isDisconnected({ ...BASE, connecting: CONNECTING_INFO })).toBe(
      false,
    );
  });

  it("returns false when disconnecting", () => {
    expect(
      isDisconnected({ ...BASE, disconnecting: [DISCONNECTING_INFO] }),
    ).toBe(false);
  });

  it("returns false when reconnecting", () => {
    expect(isDisconnected({ ...BASE, reconnecting: CONNECTING_INFO })).toBe(
      false,
    );
  });

  it("returns false when a parked reconnect target remains", () => {
    expect(isDisconnected({ ...BASE, target_destination: "dest-1" })).toBe(
      false,
    );
  });
});

describe("isXDAITransferred", () => {
  it("returns false when not in PreparingSafe run mode", () => {
    expect(isXDAITransferred(BASE_APP_STATE)).toBe(false);
  });

  it("returns false when balance_recommendation is null", () => {
    const state = appStateWithPreparingSafe({
      ...PREPARING_SAFE,
      node_xdai: 1_000n,
      balance_recommendation: null,
    });
    expect(isXDAITransferred(state)).toBe(false);
  });

  it("returns false when node_xdai is below the recommendation", () => {
    const state = appStateWithPreparingSafe({
      ...PREPARING_SAFE,
      node_xdai: BALANCE_RECOMMENDATION.xdai - 1n,
    });
    expect(isXDAITransferred(state)).toBe(false);
  });

  it("returns true when node_xdai meets the recommendation", () => {
    const state = appStateWithPreparingSafe({
      ...PREPARING_SAFE,
      node_xdai: BALANCE_RECOMMENDATION.xdai,
    });
    expect(isXDAITransferred(state)).toBe(true);
  });

  it("returns true when node_xdai exceeds the recommendation", () => {
    const state = appStateWithPreparingSafe({
      ...PREPARING_SAFE,
      node_xdai: BALANCE_RECOMMENDATION.xdai + 1n,
    });
    expect(isXDAITransferred(state)).toBe(true);
  });
});

describe("isWxHOPRTransferred", () => {
  it("returns false when not in PreparingSafe run mode", () => {
    expect(isWxHOPRTransferred(BASE_APP_STATE)).toBe(false);
  });

  it("returns false when balance_recommendation is null", () => {
    const state = appStateWithPreparingSafe({
      ...PREPARING_SAFE,
      node_wxhopr: 1_000n,
      balance_recommendation: null,
    });
    expect(isWxHOPRTransferred(state)).toBe(false);
  });

  it("returns false when node_wxhopr is below the recommendation", () => {
    const state = appStateWithPreparingSafe({
      ...PREPARING_SAFE,
      node_wxhopr: BALANCE_RECOMMENDATION.wxhopr - 1n,
    });
    expect(isWxHOPRTransferred(state)).toBe(false);
  });

  it("returns true when node_wxhopr meets the recommendation", () => {
    const state = appStateWithPreparingSafe({
      ...PREPARING_SAFE,
      node_wxhopr: BALANCE_RECOMMENDATION.wxhopr,
    });
    expect(isWxHOPRTransferred(state)).toBe(true);
  });

  it("returns true when node_wxhopr exceeds the recommendation", () => {
    const state = appStateWithPreparingSafe({
      ...PREPARING_SAFE,
      node_wxhopr: BALANCE_RECOMMENDATION.wxhopr + 1n,
    });
    expect(isWxHOPRTransferred(state)).toBe(true);
  });
});

function appStateWithRouteHealth(
  routeHealth: RouteHealthView | null,
): AppState {
  return {
    ...BASE_APP_STATE,
    destinations: {
      "dest-1": { destination: DESTINATION, route_health: routeHealth },
    },
  };
}

function routeHealth(state: RouteHealthView["state"]): RouteHealthView {
  return {
    state,
    last_error: null,
    walk: null,
    quick_probe: null,
  };
}

describe("deriveVPNStatus", () => {
  it("reports Reconnecting when a target is kept with nothing in flight", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target_destination: "dest-1",
      }),
    ).toBe("Reconnecting");
  });

  it("reports Reconnecting for a reconnect sent without a phase", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target_destination: "dest-1",
        reconnecting: PHASELESS_RECONNECTING_INFO,
      }),
    ).toBe("Reconnecting");
  });

  it("reports Disconnected when no target remains", () => {
    expect(deriveVPNStatus({ ...BASE, run_mode: RUNNING })).toBe(
      "Disconnected",
    );
  });

  it("keeps Disconnecting while a teardown is still in flight", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target_destination: "dest-1",
        disconnecting: [DISCONNECTING_INFO],
      }),
    ).toBe("Disconnecting");
  });

  it("keeps Connecting while a target is set", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target_destination: "dest-1",
        connecting: CONNECTING_INFO,
      }),
    ).toBe("Connecting");
  });

  it("keeps Connected while a target is set", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target_destination: "dest-1",
        connected: {
          destination_id: "dest-1",
          since: 0,
          tunnel_ping_rtt: null,
        },
      }),
    ).toBe("Connected");
  });
});

describe("waitingForRouteMessage", () => {
  it("says it is waiting while route health is still recoverable", () => {
    const state = appStateWithRouteHealth(
      routeHealth({ state: "NotRoutable" }),
    );
    expect(waitingForRouteMessage(state, "dest-1")).toBe(
      "Waiting for route to dest-1 - Brazil",
    );
  });

  it("names the reason once the route is unrecoverable", () => {
    const state = appStateWithRouteHealth(
      routeHealth({
        state: "Unrecoverable",
        reason: { IncompatibleApiVersion: { server_versions: ["v9"] } },
      }),
    );
    expect(waitingForRouteMessage(state, "dest-1")).toBe(
      "Route to dest-1 - Brazil: Incompatible server version",
    );
  });

  it("waits when there is no route health at all", () => {
    expect(waitingForRouteMessage(appStateWithRouteHealth(null), "dest-1"))
      .toBe(
        "Waiting for route to dest-1 - Brazil",
      );
  });

  it("falls back to the id for an unknown destination", () => {
    expect(waitingForRouteMessage(BASE_APP_STATE, "dest-9")).toBe(
      "Waiting for route to dest-9",
    );
  });
});
<<<<<<< HEAD
=======

describe("formatStall", () => {
  const stall = { since: 0, failed_pings: 2, reconnect_at: 3 };

  it("counts seconds, minutes and hours since the stall began", () => {
    expect(formatStall(stall, 18_000)).toBe("stalled 18 s (2/3)");
    expect(formatStall(stall, 150_000)).toBe("stalled 2 min (2/3)");
    expect(formatStall(stall, 7_200_000)).toBe("stalled 2 h (2/3)");
  });

  it("clamps a clock behind the daemon's to zero", () => {
    expect(formatStall({ ...stall, since: 5_000 }, 1_000)).toBe(
      "stalled 0 s (2/3)",
    );
  });
});

describe("channelMaintenanceWarning", () => {
  const running = (
    channel_maintenance: { type: "Ok" } | {
      type: "Unavailable";
      since: number;
    },
  ): RunMode => ({
    Running: { funding_status: null, hopr_status: null, channel_maintenance },
  });

  it("shows the outage age while maintenance is unavailable", () => {
    const down = running({ type: "Unavailable", since: 0 });
    expect(channelMaintenanceWarning(down, 240_000)).toBe(
      "Channel maintenance down for 4 min — tunnel may degrade",
    );
  });

  it("is null while maintenance runs or the service is not running", () => {
    expect(channelMaintenanceWarning(running({ type: "Ok" }), 0)).toBeNull();
    expect(channelMaintenanceWarning("NotRunning", 0)).toBeNull();
    expect(channelMaintenanceWarning(null, 0)).toBeNull();
  });
});

describe("connectButtonLook", () => {
  const cancel = { label: "Cancel", variant: "cancel" };
  const disconnect = { label: "Disconnect", variant: "danger" };

  it("offers Connect while disconnected", () => {
    expect(connectButtonLook("Disconnected", null, false)).toEqual({
      label: "Connect",
      variant: "primary",
    });
  });

  it("offers Cancel while an attempt is in flight", () => {
    expect(connectButtonLook("Connecting", "dest-1", false)).toEqual(cancel);
  });

  it("offers Cancel while switching away from a connected destination", () => {
    expect(connectButtonLook("Disconnecting", "dest-2", false)).toEqual(cancel);
  });

  it("offers Cancel while a parked target waits on a route", () => {
    expect(connectButtonLook("Reconnecting", "dest-1", false)).toEqual(cancel);
  });

  it("offers a red Disconnect while an established tunnel reconnects", () => {
    expect(connectButtonLook("Reconnecting", "dest-1", true)).toEqual(
      disconnect,
    );
  });

  it("offers Connect once a plain disconnect is under way", () => {
    expect(connectButtonLook("Disconnecting", null, false).label).toBe(
      "Connect",
    );
  });

  it("offers a red Disconnect once connected", () => {
    expect(connectButtonLook("Connected", "dest-1", false)).toEqual(disconnect);
  });
});

describe("isSwitchingDestination", () => {
  it("tells a destination switch from a plain disconnect", () => {
    expect(isSwitchingDestination("Disconnecting", "dest-2")).toBe(true);
    expect(isSwitchingDestination("Disconnecting", null)).toBe(false);
    expect(isSwitchingDestination("Connecting", "dest-2")).toBe(false);
  });
});
>>>>>>> 2c73831 (fix(ui): keep Cancel on the button for the whole connect attempt (release/hoprdv4) (#560))
