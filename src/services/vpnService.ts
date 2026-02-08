import { invoke } from "@tauri-apps/api/core";

// Library responses

export type StatusResponse = {
  run_mode: RunMode;
  destinations: DestinationState[];
};

export type ConnectResponse =
  | { Connecting: Destination }
  | { WaitingToConnect: [Destination, Connectivity] }
  | { UnableToConnect: [Destination, Connectivity] }
  | "DestinationNotFound";

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
  connectivity: Connectivity;
  exit_health: DestinationHealth;
};

export type Destination = {
  id: string;
  meta: Record<string, string>;
  address: string;
  routing: RoutingOptions;
};

export type ConnectionState =
  | "None"
  // Connecting tuple (since: timestamp, phase/status: UpPhase) - see gnosis_vpn-lib/src/core/conn.rs
  | { Connecting: [number, UpPhase] }
  // Connected since timestamp (SystemTime serializes as timestamp number)
  | { Connected: [number] }
  // Disconecting tuple (since: timestamp, phase/status: DownPhase) - see gnosis_vpn-lib/src/core/disconn.rs
  | { Disconnecting: [number, DownPhase] };

export type UpPhase =
  | "Init"
  | "GeneratingWg"
  | "OpeningBridge"
  | "RegisterWg"
  | "ClosingBridge"
  | "OpeningPing"
  | "EstablishDynamicWgTunnel"
  | "FallbackGatherPeerIps"
  | "FallbackToStaticWgTunnel"
  | "VerifyPing"
  | "AdjustToMain"
  | "ConnectionEstablished";

export type DownPhase =
  | "Disconnecting"
  | "DisconnectingWg"
  | "OpeningBridge"
  | "UnregisterWg"
  | "ClosingBridge";

export type PreparingSafe = {
  node_address: string;
  node_xdai: string;
  node_wxhopr: string;
  funding_tool: FundingTool;
};

export type Running = {
  funding: FundingState;
};

export type Warmup = {
  status: WarmupStatus;
};

export enum WarmupStatus {
  // hopr construction not yet started
  Initializing = "Initializing edge client",
  // Hopr init states
  ValidatingConfig = "Validating edge client configuration",
  IdentifyingNode = "Identifying ourselves",
  InitializingDatabase = "Initializing local storage",
  ConnectingBlockchain = "Querying ledger",
  CreatingNode = "Creating edge client runtime",
  StartingNode = "Starting edge client runtime",
  Ready = "Edge client runtime ready for action",
  // Hopr running states
  Uninitialized = "Orienting ourselves",
  WaitingForFunds = "Waiting to get funded",
  CheckingBalance = "Checking funding state",
  ValidatingNetworkConfig = "Validating network configuration",
  SubscribingToAnnouncements = "Subscribing to ledger updates",
  RegisteringSafe = "Registering safe identity",
  AnnouncingNode = "Announcing ourselves",
  AwaitingKeyBinding = "Waiting for ledger verification",
  InitializingServices = "Initializing service layers",
  Running = "Running",
  Terminated = "Terminated",
}

export type FundingTool =
  | "NotStarted"
  | "InProgress"
  | "CompletedSuccess"
  | {
      CompletedError: string;
    };

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
  | { Warmup: WarmupStatus }
  /// Normal operation where connections can be made
  | { Running: Running }
  /// Service shutting down
  | "Shutdown";

export type Info = {
  node_address: string;
  node_peer_id: string;
  safe_address: string;
};

export type Connectivity = {
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
  // final - destination id is invalid - should be impossible due to config deserialization
  | "InvalidId"
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

/// exit node health check - periodically updated
export type DestinationHealth =
  // waiting for check
  | "Init"
  // check underway
  | { Running: DHRunning }
  // check failed
  | { Failure: DHFailure }
  // received health metrics
  | { Success: DHSuccess };

export type DHRunning = {
  // running since timestamp
  since: number;
};

export type DHFailure = {
  // failures check started at timestamp
  checked_at: number;
  // error message
  error: string;
  // count of previous failures
  previous_failures: number;
};

export type DHSuccess = {
  // success check started at timestamp
  checked_at: number;
  // reported by exit node
  health: ExitHealth;
  // total time to create session and query for health in seconds
  total_time: number;
  // health query after session was established in seconds
  round_trip_time: number;
};

// Statistics reported by exit node
export type ExitHealth = {
  // client capacity statistics
  slots: Slots;
  // cpu statistics
  load_avg: LoadAvg;
};

export type Slots = {
  // free client slots
  available: number;
  // number of connected clients
  connected: number;
};

export type LoadAvg = {
  // processing queue usage last minute
  one: number;
  // processing queue usage last 5 minutes
  five: number;
  // processing queue usage last 15 minutes
  fifteen: number;
  // processor count
  nproc: number;
};

export function formatHealth(health: Health): string {
  switch (health) {
    case "ReadyToConnect":
      return "Ready to connect";
    case "MissingPeeredFundedChannel":
      return "Waiting on peer discovery";
    case "MissingPeeredChannel":
      return "Waiting on peer discovery";
    case "MissingFundedChannel":
      return "Checking channel funds";
    case "NotPeered":
      return "Waiting on peer discovery";
    case "NotAllowed":
      return "Connection not allowed";
    case "InvalidId":
      return "Connection impossible";
    case "InvalidPath":
      return "Connection impossible";
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
    default:
      return `Failed: ${ft.CompletedError}`;
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

export function isFundingError(
  ft: FundingTool | undefined,
): ft is { CompletedError: string } {
  return !!ft && typeof ft === "object" && "CompletedError" in ft;
}

export function equalFundingTool(
  a: FundingTool | undefined,
  b: FundingTool | undefined,
): boolean {
  if (typeof a !== typeof b) return false;
  if (isFundingError(a) && isFundingError(b)) {
    return a.CompletedError === b.CompletedError;
  }
  return a === b;
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

  static async connect(id: string): Promise<ConnectResponse> {
    try {
      return (await invoke("connect", { id })) as ConnectResponse;
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

  static async compressLogs(destPath: string): Promise<void> {
    try {
      // Tauri v2 command parameter mapping defaults to camelCase,
      // so we pass `destPath` here to match the backend param `dest_path`.
      return await invoke("compress_logs", { destPath });
    } catch (error) {
      console.error("Failed to compress logs", error);
      throw new Error(`Compress Logs Error: ${error}`);
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

    // Sort by id for consistent selection
    const sorted = [...destinations].sort((a, b) =>
      a.destination.id.localeCompare(b.destination.id),
    );
    return sorted[0].destination.id;
  }
}
