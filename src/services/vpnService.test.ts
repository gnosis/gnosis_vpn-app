import { describe, expect, it } from "vitest";
import {
  BalanceResponseSchema,
  ConnectResponseSchema,
  DisconnectResponseSchema,
  ServiceInfoSchema,
  StatusResponseSchema,
} from "./vpnService.ts";

// Fixture helpers matching the exact JSON serde output from the Rust layer.

const DESTINATION = {
  id: "test-exit",
  meta: { location: "EU" },
  address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  routing: 1,
};

const EXIT_HEALTH = {
  checked_at: 1_700_000_000_000,
  versions: { versions: ["v1"], latest: "v1" },
  ping_rtt: 42.5,
  health: {
    slots: { available: 10, connected: 2 },
    load_avg: { one: 0.5, five: 0.3, fifteen: 0.2, nproc: 4 },
  },
};

const ROUTE_HEALTH_VIEW = {
  state: { state: "Routable" },
  last_error: null,
  checking_since: null,
  consecutive_failures: 0,
};

const DESTINATION_STATE = {
  destination: DESTINATION,
  route_health: ROUTE_HEALTH_VIEW,
};

const CONNECTED_INFO = {
  destination_id: "test-exit",
  since: 1_700_000_000_000,
};

const CONNECTING_INFO = {
  destination_id: "test-exit",
  since: 1_700_000_000_000,
  phase: "Init",
};

const DISCONNECTING_INFO = {
  destination_id: "test-exit",
  since: 1_700_000_000_000,
  phase: "Disconnecting",
};

describe("StatusResponseSchema", () => {
  const base = {
    destinations: [],
    target_destination: null,
    connected: null,
    connecting: null,
    reconnecting: null,
    disconnecting: [],
  };

  it("parses NotRunning run_mode", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: "NotRunning",
    });
    expect(result.success).toBe(true);
  });

  it("parses Shutdown run_mode", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: "Shutdown",
    });
    expect(result.success).toBe(true);
  });

  it("parses Warmup run_mode", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: { Warmup: { status: "Initializing", last_error: null } },
    });
    expect(result.success).toBe(true);
  });

  it("parses Running run_mode", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: {
        Running: { funding_issues: null, hopr_status: "Running" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses PreparingSafe run_mode", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: {
        PreparingSafe: {
          node_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          node_xdai: "0.01",
          node_wxhopr: "0",
          funding_tool: null,
          error: null,
          balance_recommendation: null,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses DeployingSafe run_mode", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: {
        DeployingSafe: {
          node_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses ConnectedInfo in connected field", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: "NotRunning",
      connected: CONNECTED_INFO,
    });
    expect(result.success).toBe(true);
  });

  it("parses connecting/reconnecting/disconnecting info", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: "NotRunning",
      connecting: CONNECTING_INFO,
      reconnecting: { ...CONNECTING_INFO, phase: "GeneratingWg" },
      disconnecting: [DISCONNECTING_INFO],
    });
    expect(result.success).toBe(true);
  });

  it("parses destination with RouteHealthState variants", () => {
    const routeHealthVariants = [
      { state: "Routable" },
      { state: "NeedsChannel" },
      { state: "NeedsPeering", has_channel: false },
      { state: "Unrecoverable", reason: "NotAllowed" },
      { state: "Unrecoverable", reason: "InvalidPath" },
      {
        state: "Unrecoverable",
        reason: { IncompatibleApiVersion: { server_versions: ["v2"] } },
      },
      { state: "ReadyToConnect", exit: EXIT_HEALTH },
      { state: "Connecting", exit: EXIT_HEALTH, tunnel_ping_rtt: null },
      { state: "Connecting", exit: EXIT_HEALTH, tunnel_ping_rtt: 12.3 },
    ];

    for (const state of routeHealthVariants) {
      const result = StatusResponseSchema.safeParse({
        ...base,
        run_mode: "NotRunning",
        destinations: [
          {
            destination: DESTINATION,
            route_health: { ...ROUTE_HEALTH_VIEW, state },
          },
        ],
      });
      expect(result.success, `failed for state ${JSON.stringify(state)}`).toBe(
        true,
      );
    }
  });

  it("parses destination with null route_health", () => {
    const result = StatusResponseSchema.safeParse({
      ...base,
      run_mode: "NotRunning",
      destinations: [{ destination: DESTINATION, route_health: null }],
    });
    expect(result.success).toBe(true);
  });
});

describe("ConnectResponseSchema", () => {
  it("parses DestinationNotFound", () => {
    expect(ConnectResponseSchema.safeParse("DestinationNotFound").success).toBe(
      true,
    );
  });

  it("parses AlreadyConnected", () => {
    expect(
      ConnectResponseSchema.safeParse({ AlreadyConnected: DESTINATION })
        .success,
    ).toBe(true);
  });

  it("parses Connecting", () => {
    expect(
      ConnectResponseSchema.safeParse({ Connecting: DESTINATION }).success,
    ).toBe(true);
  });

  it("parses WaitingToConnect", () => {
    expect(
      ConnectResponseSchema.safeParse({
        WaitingToConnect: [DESTINATION, { state: "Routable" }],
      }).success,
    ).toBe(true);
  });

  it("parses UnableToConnect", () => {
    expect(
      ConnectResponseSchema.safeParse({
        UnableToConnect: [DESTINATION, { state: "NeedsChannel" }],
      }).success,
    ).toBe(true);
  });
});

describe("DisconnectResponseSchema", () => {
  it("parses NotConnected", () => {
    expect(DisconnectResponseSchema.safeParse("NotConnected").success).toBe(
      true,
    );
  });

  it("parses Disconnecting", () => {
    expect(
      DisconnectResponseSchema.safeParse({ Disconnecting: DESTINATION })
        .success,
    ).toBe(true);
  });
});

describe("BalanceResponseSchema", () => {
  const base = {
    node: "0.5",
    safe: "10.0",
    channels_out: "5.0",
    info: {
      node_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      node_peer_id: "16Uiu2HAmExamplePeerId",
      safe_address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    funding_issues: null,
    ideal_balance: null,
    capacity_allocations: null,
  };

  it("parses minimal balance response", () => {
    expect(BalanceResponseSchema.safeParse(base).success).toBe(true);
  });

  it("parses with funding issues", () => {
    const result = BalanceResponseSchema.safeParse({
      ...base,
      funding_issues: ["Unfunded", "NodeLowOnFunds"],
    });
    expect(result.success).toBe(true);
  });

  it("parses with ideal_balance and capacity_allocations", () => {
    const result = BalanceResponseSchema.safeParse({
      ...base,
      ideal_balance: { wxhopr: "100.0", xdai: "0.1" },
      capacity_allocations: [
        {
          allocator: { type: "safe" },
          capacity: {
            stake: "50.0",
            expected_messages: 1000,
            min_guaranteed_messages: 500,
            byte_capacity: 1_048_576,
          },
        },
        {
          allocator: {
            type: "peer",
            address: "0xcccccccccccccccccccccccccccccccccccccccc",
          },
          capacity: {
            stake: "25.0",
            expected_messages: 500,
            min_guaranteed_messages: 250,
            byte_capacity: 524_288,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("ServiceInfoSchema", () => {
  it("parses service info with all fields", () => {
    const result = ServiceInfoSchema.safeParse({
      version: "0.91.0",
      package_version: "1.0.0",
      log_file: "/var/log/gnosisvpn.log",
    });
    expect(result.success).toBe(true);
  });

  it("parses service info with null optional fields", () => {
    const result = ServiceInfoSchema.safeParse({
      version: "0.91.0",
      package_version: null,
      log_file: null,
    });
    expect(result.success).toBe(true);
  });
});
