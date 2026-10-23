import { describe, expect, it } from "vitest";
import type {
  BalanceRecommendation,
  ChannelMaintenance,
  Connection,
  Destination,
  Disconnecting,
  PreparingSafe,
  RouteHealthView,
  RunMode,
  StatusResponse,
} from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";
import {
  channelMaintenanceWarning,
  connectButtonLook,
  deriveVPNStatus,
  formatStall,
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
  run_mode: { type: "not_running" },
  destinations: [],
  target: null,
  connection: { type: "disconnected" },
  disconnecting: [],
  probe: null,
};

const CONNECTING: Connection = {
  type: "connecting",
  destination: "dest-1",
  since: 0,
  phase: "init",
};

const CONNECTED: Connection = {
  type: "connected",
  destination: "dest-1",
  since: 0,
  tunnel_ping_rtt: null,
  stall: null,
};

const RECONNECTING: Connection = {
  type: "reconnecting",
  destination: "dest-1",
  since: 0,
  phase: "init",
};

// What the daemon sends while a reconnect waits on route health.
const PHASELESS_RECONNECTING: Connection = { ...RECONNECTING, phase: null };

const DISCONNECTING: Disconnecting = {
  destination: "dest-1",
  since: 0,
  phase: "disconnecting",
};

const RUNNING: RunMode = {
  type: "running",
  funding_status: null,
  hopr_status: null,
  channel_maintenance: { type: "ok" },
};

const DESTINATION: Destination = makeDestination({
  geo: { country: "br", source: { type: "announced_ip" } },
});

const BASE_APP_STATE: AppState = {
  currentScreen: "initialization" as AppState["currentScreen"],
  serviceInfo: null,
  availableDestinations: [],
  destinations: {},
  connection: { type: "disconnected" },
  disconnecting: [],
  probe: null,
  isLoading: false,
  runMode: null,
  vpnStatus: "ServiceUnavailable",
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

const BALANCE_RECOMMENDATION: BalanceRecommendation = {
  wxhopr: 100n,
  xdai: 50n,
  channel_stakes: 0n,
  fee_to_start: 0n,
  txs_to_start: 0,
  xdai_fee_per_tx: 0n,
  topup_headroom: 0n,
};

const PREPARING_SAFE: PreparingSafe = {
  type: "preparing_safe",
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
    runMode: preparingSafe,
  };
}

describe("isConnected", () => {
  it("returns true when connected info is present", () => {
    expect(
      isConnected({ ...BASE, connection: CONNECTED }),
    ).toBe(true);
  });

  it("returns false when connected is null", () => {
    expect(isConnected(BASE)).toBe(false);
  });
});

describe("isConnecting", () => {
  it("returns true when connecting info is present", () => {
    expect(isConnecting({ ...BASE, connection: CONNECTING })).toBe(true);
  });

  it("returns false when connecting is null", () => {
    expect(isConnecting(BASE)).toBe(false);
  });
});

describe("isDisconnecting", () => {
  it("returns true when disconnecting list is non-empty", () => {
    expect(
      isDisconnecting({ ...BASE, disconnecting: [DISCONNECTING] }),
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
      isDisconnected({ ...BASE, connection: CONNECTED }),
    ).toBe(false);
  });

  it("returns false when connecting", () => {
    expect(isDisconnected({ ...BASE, connection: CONNECTING })).toBe(false);
  });

  it("returns false when disconnecting", () => {
    expect(
      isDisconnected({ ...BASE, disconnecting: [DISCONNECTING] }),
    ).toBe(false);
  });

  it("returns false when reconnecting", () => {
    expect(isDisconnected({ ...BASE, connection: RECONNECTING })).toBe(
      false,
    );
  });

  it("returns false when a parked reconnect target remains", () => {
    expect(isDisconnected({ ...BASE, target: "dest-1" })).toBe(false);
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
        target: "dest-1",
      }),
    ).toBe("Reconnecting");
  });

  it("reports Reconnecting for a reconnect sent without a phase", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target: "dest-1",
        connection: PHASELESS_RECONNECTING,
      }),
    ).toBe("Reconnecting");
  });

  it("reports Disconnected when no target remains", () => {
    expect(deriveVPNStatus({ ...BASE, run_mode: RUNNING })).toBe(
      "Disconnected",
    );
  });

  it("stays Connected while the tunnel is stalled", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target: "dest-1",
        connection: {
          ...CONNECTED,
          tunnel_ping_rtt: 12,
          stall: { since: 0, failed_pings: 2, reconnect_at: 3 },
        },
      }),
    ).toBe("Connected");
  });

  it("keeps Disconnecting while a teardown is still in flight", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target: "dest-1",
        disconnecting: [DISCONNECTING],
      }),
    ).toBe("Disconnecting");
  });

  it("keeps Connecting while a target is set", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target: "dest-1",
        connection: CONNECTING,
      }),
    ).toBe("Connecting");
  });

  it("keeps Connected while a target is set", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target: "dest-1",
        connection: CONNECTED,
      }),
    ).toBe("Connected");
  });

  it("reports Reconnecting while a reconnect attempt is in flight", () => {
    expect(
      deriveVPNStatus({
        ...BASE,
        run_mode: RUNNING,
        target: "dest-1",
        connection: RECONNECTING,
      }),
    ).toBe("Reconnecting");
  });

  it("reports the warmup stage, and Init as its first one", () => {
    const warmup: RunMode = {
      type: "warmup",
      stage: "waiting_for_funds",
      last_error: null,
    };
    expect(deriveVPNStatus({ ...BASE, run_mode: warmup })).toBe(
      "waiting_for_funds",
    );
    const init: RunMode = { type: "init", last_error: null };
    expect(deriveVPNStatus({ ...BASE, run_mode: init })).toBe("initializing");
  });
});

describe("waitingForRouteMessage", () => {
  it("says it is waiting while route health is still recoverable", () => {
    const state = appStateWithRouteHealth(
      routeHealth({ type: "not_routable" }),
    );
    expect(waitingForRouteMessage(state, "dest-1")).toBe(
      "Waiting for route to dest-1 - Brazil",
    );
  });

  it("names the reason once the route is unrecoverable", () => {
    const state = appStateWithRouteHealth(
      routeHealth({
        type: "unrecoverable",
        reason: { type: "incompatible_api_version", offered: ["v9"] },
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
    channel_maintenance: ChannelMaintenance,
  ): RunMode => ({ ...RUNNING, channel_maintenance });

  it("shows the outage age while maintenance is unavailable", () => {
    const down = running({ type: "unavailable", since: 0 });
    expect(channelMaintenanceWarning(down, 240_000)).toBe(
      "Channel maintenance down for 4 min — tunnel may degrade",
    );
  });

  it("is null while maintenance runs or the service is not running", () => {
    expect(channelMaintenanceWarning(running({ type: "ok" }), 0)).toBeNull();
    expect(channelMaintenanceWarning({ type: "not_running" }, 0)).toBeNull();
    expect(channelMaintenanceWarning(null, 0)).toBeNull();
  });
});

describe("connectButtonLook", () => {
  const cancel = { label: "Cancel", variant: "stop" };
  const disconnect = { label: "Disconnect", variant: "stop" };

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

  it("offers Disconnect while an established tunnel reconnects", () => {
    expect(connectButtonLook("Reconnecting", "dest-1", true)).toEqual(
      disconnect,
    );
  });

  it("offers Connect once a plain disconnect is under way", () => {
    expect(connectButtonLook("Disconnecting", null, false).label).toBe(
      "Connect",
    );
  });

  it("offers Disconnect once connected", () => {
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
