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
  isWxHOPRTransferred,
  isXDAITransferred,
  waitingForRouteMessage,
} from "./status.ts";

const BASE: StatusResponse = {
  run_mode: "NotRunning",
  destinations: [],
  target_destination: null,
  connected: null,
  connecting: null,
  reconnecting: null,
  disconnecting: [],
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

const DESTINATION: Destination = {
  id: "dest-1",
  meta: { location: "Brazil" },
  address: "0xexit",
  routing: 1,
};

const BASE_APP_STATE: AppState = {
  currentScreen: "initialization" as AppState["currentScreen"],
  serviceInfo: null,
  availableDestinations: [],
  destinations: {},
  connected: null,
  connecting: null,
  reconnecting: null,
  disconnecting: [],
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
        connected: { destination_id: "dest-1", since: 0 },
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
        connected: { destination_id: "dest-1", since: 0 },
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
    checking_since: null,
    consecutive_failures: 0,
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
        connected: { destination_id: "dest-1", since: 0 },
      }),
    ).toBe("Connected");
  });
});

describe("waitingForRouteMessage", () => {
  it("says it is waiting while route health is still recoverable", () => {
    const state = appStateWithRouteHealth(
      routeHealth({ state: "NeedsPeering", has_channel: false }),
    );
    expect(waitingForRouteMessage(state, "dest-1")).toBe(
      "Waiting for route to dest-1 - Brazil",
    );
  });

  it("names the reason once the route is unrecoverable", () => {
    const state = appStateWithRouteHealth(
      routeHealth({ state: "Unrecoverable", reason: "InvalidPath" }),
    );
    expect(waitingForRouteMessage(state, "dest-1")).toBe(
      "Route to dest-1 - Brazil: Connection impossible",
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
