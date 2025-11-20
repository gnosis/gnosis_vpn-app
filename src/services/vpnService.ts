// import { toBytes20 } from "@src/utils/address";
import { invoke } from "@tauri-apps/api/core";

// Library responses

export type StatusResponse = {
  run_mode: RunMode;
  destinations: DestinationState[];
};

export type ConnectResponse =
  | { Connecting: Destination }
  | { WaitingToConnect: [Destination, DestinationHealth | null] }
  | { UnableToConnect: [Destination, DestinationHealth] }
  | "AddressNotFound";

export type DisconnectResponse =
  | { Disconnecting: Destination }
  | "NotConnected";

export type BalanceResponse = {
  node: string;
  safe: string;
  channels_out: string;
  info: Info;
  issues: FundingIssue[];
};

// Library types

export type RoutingOptions = { Hops: number } | { IntermediatePath: string[] };

export type DestinationState = {
  destination: Destination;
  connection_state: ConnectionState;
  health: DestinationHealth;
};

export type Destination = {
  meta: Record<string, string>;
  address: string;
  routing: RoutingOptions;
};

export type ConnectionState =
  | "None"
  // Connecting tuple (since: timestamp, phase/status: string) - see gnosis_vpn-lib/src/core/conn.rs
  | { Connecting: [number, string] }
  // Connected since timestamp (SystemTime serializes as timestamp number)
  | { Connected: [number] }
  // Disconecting tuple (since: timestamp, phase/status: string) - see gnosis_vpn-lib/src/core/disconn.rs
  | { Disconnecting: [number, string] };

export type PreparingSafe = {
  node_address: string;
  node_xdai: string;
  node_wxhopr: string;
  funding_tool: FundingTool;
};

export type Running = {
  funding: FundingState;
};

export type FundingTool =
  | "NotStarted"
  | "InProgress"
  | "CompletedSuccess"
  | "CompletedError";

export type FundingIssue =
  | "Unfunded" // cannot work at all - initial state
  | "ChannelsOutOfFunds" // does not work - no traffic possible
  | "SafeOutOfFunds" // keeps working - cannot top up channels
  | "SafeLowOnFunds" // warning before SafeOutOfFunds
  | "NodeUnderfunded" // keeps working until channels are drained - cannot open new or top up existing channels
  | "NodeLowOnFunds"; // warning before NodeUnderfunded

export type FundingState =
  | "Querying"
  | { TopIssue: FundingIssue }
  | "WellFunded";

export type RunMode =
  /// Initial start, after creating safe this state will not be reached again
  | { PreparingSafe: PreparingSafe }
  /// Subsequent service start up in this state and after preparing safe
  | "Warmup"
  /// Normal operation where connections can be made
  | { Running: Running }
  /// Service shutting down
  | "Shutdown";

export type Info = {
  node_address: string;
  node_peer_id: string;
  safe_address: string;
  network: string;
};

export type DestinationHealth = {
  last_error: string | null;
  health: Health;
  need: Need;
};

export type Health =
  | "ReadyToConnect"
  | "MissingPeeredFundedChannel"
  | "MissingPeeredChannel"
  | "MissingFundedChannel"
  | "NotPeered"
  // final - not allowed to connect to this destination
  | "NotAllowed"
  // final - destination address is invalid - should be impossible due to config deserialization
  | "InvalidAddress"
  // final - destination path is invalid - should be impossible due to config deserialization
  | "InvalidPath";

export function isReadyToConnect(health: Health | undefined): boolean {
  return health === "ReadyToConnect";
}

/// Requirements to be able to connect to this destination
/// This is statically derived at construction time from a destination's routing options.
export type Need =
  | { Channel: string }
  | "AnyChannel"
  | { Peering: string }
  | "Nothing";

export function formatHealth(health: Health): string {
  switch (health) {
    case "ReadyToConnect":
      return "Ready to connect";
    case "MissingPeeredFundedChannel":
      return "Waiting on peer discovery";
    case "MissingPeeredChannel":
      return "Waiting on peer discovery";
    case "MissingFundedChannel":
      return "Waiting on funding check";
    case "NotPeered":
      return "Waiting on peer discovery";
    case "NotAllowed":
      return "Connection not allowed";
    case "InvalidAddress":
      return "Invalid address";
    case "InvalidPath":
      return "Invalid path";
    default:
      return String(health);
  }
}

export function formatFundingTool(ft: FundingTool): string {
  switch (ft) {
    case "NotStarted":
      return "Not started";
    case "InProgress":
      return "In progress";
    case "CompletedSuccess":
      return "Completed successfully";
    case "CompletedError":
      return "Completed with error";
    default:
      return String(ft);
  }
}

// Type guards for RunMode variants to avoid repetitive typeof/in checks
export function isPreparingSafeRunMode(
  rm: RunMode | null | undefined,
): rm is { PreparingSafe: PreparingSafe } {
  return !!rm && typeof rm === "object" && "PreparingSafe" in rm;
}

export function isRunningRunMode(
  rm: RunMode | null | undefined,
): rm is { Running: Running } {
  return !!rm && typeof rm === "object" && "Running" in rm;
}

export class VPNService {
  static async getStatus(): Promise<StatusResponse> {
    try {
      return (await invoke("status")) as StatusResponse;
    } catch (error) {
      console.error("Failed to get VPN status:", error);
      throw new Error(`Status Error: ${error}`);
    }
  }

  static async connect(address: string): Promise<ConnectResponse> {
    try {
      return (await invoke("connect", { address })) as ConnectResponse;
    } catch (error) {
      console.error("Failed to connect to VPN:", error);
      throw new Error(`Connect Error: ${error}`);
    }
  }

  static async disconnect(): Promise<DisconnectResponse> {
    try {
      return (await invoke("disconnect")) as DisconnectResponse;
    } catch (error) {
      console.error("Failed to disconnect from VPN:", error);
      throw new Error(`Disconnect Error: ${error}`);
    }
  }

  /**
   * Request latest balance from VPN node.
   *
   * Returns `null` when:
   * - Balance information has not been queried yet by the service
   * - Service is in Warmup or PreparingSafe state (balance not available)
   * - Balance data is being fetched asynchronously (updates every ~60 seconds)
   *
   * To manually trigger a balance update, call `refreshNode()` first, then wait a moment
   * before calling `balance()` again.
   *
   * @returns BalanceResponse with node, safe, and channel balances, or null if not available
   */
  static async balance(): Promise<BalanceResponse | null> {
    try {
      const result = (await invoke("balance")) as BalanceResponse | null;
      if (result === null) {
        console.log(
          "Balance not available yet - may need to call refreshNode() or wait for service to be ready",
        );
      }
      return result;
    } catch (error) {
      console.error("Failed to query VPN balance", error);
      throw new Error(`Balance Error: ${error}`);
    }
  }

  static async refreshNode(): Promise<void> {
    try {
      await invoke("refresh_node");
    } catch (error) {
      console.error("Failed to request VPN node balance update", error);
      throw new Error(`Refresh Node Error: ${error}`);
    }
  }

  static async fundingTool(secret: string): Promise<void> {
    try {
      return await invoke("funding_tool", { secret });
    } catch (error) {
      console.error("Failed to request funding tool execution", error);
      throw new Error(`Funding Tool Error: ${error}`);
    }
  }

  static getBestDestination(
    destinations: StatusResponse["destinations"],
  ): string | null {
    if (destinations.length === 0) return null;

    // Sort by address for consistent selection
    const sorted = [...destinations].sort((a, b) =>
      a.destination.address.localeCompare(b.destination.address)
    );
    return sorted[0].destination.address;
  }
}
