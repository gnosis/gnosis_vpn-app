import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// ==========================================
// Zod Schemas & Inferred Types
// ==========================================

export const SerializedSinceTimeSchema = z.object({
  secs_since_epoch: z.number(),
  nanos_since_epoch: z.number(),
});
export type SerializedSinceTime = z.infer<typeof SerializedSinceTimeSchema>;

export const SerializedTimeSchema = z.object({
  nanos: z.number(),
  secs: z.number(),
});
export type SerializedTime = z.infer<typeof SerializedTimeSchema>;

export const UpPhaseSchema = z.enum([
  "Init",
  "GeneratingWg",
  "OpeningBridge",
  "RegisterWg",
  "ClosingBridge",
  "OpeningPing",
  "EstablishDynamicWgTunnel",
  "FallbackGatherPeerIps",
  "FallbackToStaticWgTunnel",
  "VerifyPing",
  "AdjustToMain",
  "ConnectionEstablished",
]);
export type UpPhase = z.infer<typeof UpPhaseSchema>;

export const DownPhaseSchema = z.enum([
  "Disconnecting",
  "DisconnectingWg",
  "OpeningBridge",
  "UnregisterWg",
  "ClosingBridge",
]);
export type DownPhase = z.infer<typeof DownPhaseSchema>;

export const ConnectionStateSchema = z.union([
  z.literal("None"),
  z.object({ Connecting: z.tuple([SerializedSinceTimeSchema, UpPhaseSchema]) }),
  z.object({ Connected: SerializedSinceTimeSchema }),
  z.object({
    Disconnecting: z.tuple([SerializedSinceTimeSchema, DownPhaseSchema]),
  }),
]);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

export const RoutingOptionsSchema = z.union([
  z.object({ Hops: z.number() }),
  z.object({ IntermediatePath: z.array(z.string()) }),
]);
export type RoutingOptions = z.infer<typeof RoutingOptionsSchema>;

export const DestinationSchema = z.object({
  id: z.string(),
  meta: z.object({ location: z.string() }).catchall(z.string()),
  address: z.string(),
  routing: RoutingOptionsSchema,
});
export type Destination = z.infer<typeof DestinationSchema>;

export const HealthSchema = z.enum([
  "ReadyToConnect",
  "MissingPeeredFundedChannel",
  "MissingPeeredChannel",
  "MissingFundedChannel",
  "NotPeered",
  "NotAllowed",
  "InvalidId",
  "InvalidPath",
]);
export type Health = z.infer<typeof HealthSchema>;

export const NeedSchema = z.union([
  z.object({ Channel: z.string() }),
  z.literal("AnyChannel"),
  z.object({ Peering: z.string() }),
  z.literal("Nothing"),
]);
export type Need = z.infer<typeof NeedSchema>;

export const ConnectivitySchema = z.object({
  last_error: z.string().nullable(),
  health: HealthSchema,
  need: NeedSchema,
});
export type Connectivity = z.infer<typeof ConnectivitySchema>;

export const SlotsSchema = z.object({
  available: z.number(),
  connected: z.number(),
});
export type Slots = z.infer<typeof SlotsSchema>;

export const LoadAvgSchema = z.object({
  one: z.number(),
  five: z.number(),
  fifteen: z.number(),
  nproc: z.number(),
});
export type LoadAvg = z.infer<typeof LoadAvgSchema>;

export const ExitHealthSchema = z.object({
  slots: SlotsSchema,
  load_avg: LoadAvgSchema,
});
export type ExitHealth = z.infer<typeof ExitHealthSchema>;

export const DHRunningSchema = z.object({
  since: SerializedSinceTimeSchema,
});
export type DHRunning = z.infer<typeof DHRunningSchema>;

export const DHFailureSchema = z.object({
  checked_at: SerializedSinceTimeSchema,
  error: z.string(),
  previous_failures: z.number(),
});
export type DHFailure = z.infer<typeof DHFailureSchema>;

export const DHSuccessSchema = z.object({
  checked_at: SerializedSinceTimeSchema,
  health: ExitHealthSchema,
  total_time: SerializedTimeSchema,
  round_trip_time: SerializedTimeSchema,
});
export type DHSuccess = z.infer<typeof DHSuccessSchema>;

export const DestinationHealthSchema = z.union([
  z.literal("Init"),
  z.object({ Running: DHRunningSchema }),
  z.object({ Failure: DHFailureSchema }),
  z.object({ Success: DHSuccessSchema }),
]);
export type DestinationHealth = z.infer<typeof DestinationHealthSchema>;

export const DestinationStateSchema = z.object({
  destination: DestinationSchema,
  connection_state: ConnectionStateSchema,
  connectivity: ConnectivitySchema,
  exit_health: DestinationHealthSchema,
});
export type DestinationState = z.infer<typeof DestinationStateSchema>;

export const ConnectResponseSchema = z.union([
  z.object({ Connecting: DestinationSchema }),
  z.object({
    WaitingToConnect: z.tuple([DestinationSchema, ConnectivitySchema]),
  }),
  z.object({
    UnableToConnect: z.tuple([DestinationSchema, ConnectivitySchema]),
  }),
  z.literal("DestinationNotFound"),
]);
export type ConnectResponse = z.infer<typeof ConnectResponseSchema>;

export const DisconnectResponseSchema = z.union([
  z.object({ Disconnecting: DestinationSchema }),
  z.literal("NotConnected"),
]);
export type DisconnectResponse = z.infer<typeof DisconnectResponseSchema>;

export const FundingIssueSchema = z.enum([
  "Unfunded",
  "ChannelsOutOfFunds",
  "SafeOutOfFunds",
  "SafeLowOnFunds",
  "NodeUnderfunded",
  "NodeLowOnFunds",
]);
export type FundingIssue = z.infer<typeof FundingIssueSchema>;

export const FundingStateSchema = z.union([
  z.literal("Querying"),
  z.object({ TopIssue: FundingIssueSchema }),
  z.literal("WellFunded"),
]);
export type FundingState = z.infer<typeof FundingStateSchema>;

export const PreparingSafeSchema = z.object({
  node_address: z.string(),
  node_xdai: z.string(),
  node_wxhopr: z.string(),
  funding_tool: z.string().nullable(),
  error: z.string().nullable(),
});
export type PreparingSafe = z.infer<typeof PreparingSafeSchema>;

export const DeployingSafeSchema = z.object({
  node_address: z.string(),
});
export type DeployingSafe = z.infer<typeof DeployingSafeSchema>;

export const WarmupStatusSchema = z.enum([
  "Initializing",
  "ValidatingConfig",
  "IdentifyingNode",
  "InitializingDatabase",
  "ConnectingBlockchain",
  "CreatingNode",
  "StartingNode",
  "Ready",
  "Uninitialized",
  "WaitingForFunds",
  "CheckingBalance",
  "ValidatingNetworkConfig",
  "SubscribingToAnnouncements",
  "RegisteringSafe",
  "AnnouncingNode",
  "AwaitingKeyBinding",
  "InitializingServices",
  "Running",
  "Terminated",
]);
export type WarmupStatus = z.infer<typeof WarmupStatusSchema>;

export const WarmupSchema = z.object({
  status: WarmupStatusSchema,
});
export type Warmup = z.infer<typeof WarmupSchema>;

export const RunningSchema = z.object({
  funding: FundingStateSchema,
  hopr_status: WarmupStatusSchema.nullable(),
});
export type Running = z.infer<typeof RunningSchema>;

export const RunModeSchema = z.union([
  z.object({ PreparingSafe: PreparingSafeSchema }),
  z.object({ DeployingSafe: DeployingSafeSchema }),
  z.object({ Warmup: WarmupSchema }),
  z.object({ Running: RunningSchema }),
  z.literal("Shutdown"),
]);
export type RunMode = z.infer<typeof RunModeSchema>;

export const InfoSchema = z.object({
  node_address: z.string(),
  node_peer_id: z.string(),
  safe_address: z.string(),
});
export type Info = z.infer<typeof InfoSchema>;

export const StatusResponseSchema = z.object({
  run_mode: RunModeSchema,
  destinations: z.array(DestinationStateSchema),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export const BalanceResponseSchema = z.object({
  node: z.string(),
  safe: z.string(),
  channels_out: z.string(),
  info: InfoSchema,
  issues: z.array(FundingIssueSchema),
});
export type BalanceResponse = z.infer<typeof BalanceResponseSchema>;

export const ServiceInfoSchema = z.object({
  version: z.string(),
  log_file: z.string().nullable(),
});
export type ServiceInfo = z.infer<typeof ServiceInfoSchema>;

// ==========================================
// Helper Functions
// ==========================================

export function isReadyToConnect(health: Health | undefined): boolean {
  return health === "ReadyToConnect";
}

export function formatHealth(health: Health): string {
  switch (health) {
    case "ReadyToConnect":
      return "Ready to connect";
    case "MissingPeeredFundedChannel":
      return "Missing peered funded channel";
    case "MissingPeeredChannel":
      return "Missing peered channel";
    case "MissingFundedChannel":
      return "Checking channel funds";
    case "NotPeered":
      return "Not peered";
    case "NotAllowed":
      return "Connection not allowed";
    case "InvalidId":
    case "InvalidPath":
      return "Connection impossible";
    default:
      return String(health);
  }
}

export function formatWarmupStatus(status: WarmupStatus): string {
  switch (status) {
    case "Initializing":
      return "Initializing edge client";
    case "ValidatingConfig":
      return "Validating edge client configuration";
    case "IdentifyingNode":
      return "Identifying ourselves";
    case "InitializingDatabase":
      return "Initializing local storage";
    case "ConnectingBlockchain":
      return "Querying ledger";
    case "CreatingNode":
      return "Creating edge client runtime";
    case "StartingNode":
      return "Starting edge client runtime";
    case "Ready":
      return "Edge client runtime ready for action";
    case "Uninitialized":
      return "Orienting ourselves";
    case "WaitingForFunds":
      return "Waiting to get funded";
    case "CheckingBalance":
      return "Checking funding state";
    case "ValidatingNetworkConfig":
      return "Validating network configuration";
    case "SubscribingToAnnouncements":
      return "Subscribing to ledger updates";
    case "RegisteringSafe":
      return "Registering safe identity";
    case "AnnouncingNode":
      return "Announcing ourselves";
    case "AwaitingKeyBinding":
      return "Waiting for ledger verification";
    case "InitializingServices":
      return "Initializing service layers";
    case "Running":
      return "Running";
    case "Terminated":
      return "Terminated";
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

export function isPreparingSafeRunMode(
  rm: RunMode | null | undefined,
): rm is { PreparingSafe: PreparingSafe } {
  return !!rm && typeof rm === "object" && "PreparingSafe" in rm;
}

export function isDeployingSafeRunMode(
  rm: RunMode | null | undefined,
): rm is { DeployingSafe: DeployingSafe } {
  return !!rm && typeof rm === "object" && "DeployingSafe" in rm;
}

export function isWarmupRunMode(
  rm: RunMode | null | undefined,
): rm is { Warmup: Warmup } {
  return !!rm && typeof rm === "object" && "Warmup" in rm;
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

// ==========================================
// API Client Service
// ==========================================

export class VPNService {
  static async startClient(keepAliveSecs: number): Promise<void> {
    try {
      const keepAlive = {
        secs: keepAliveSecs,
        nanos: 0,
      };
      await invoke("start_client", { keepAlive });
    } catch (error) {
      console.error("Failed to start VPN client:", error);
      throw new Error(`Start Client Error: ${error}`);
    }
  }

  static async info(): Promise<ServiceInfo> {
    let rawRes;
    try {
      rawRes = await invoke("info");
      return ServiceInfoSchema.parse(rawRes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`Issues with ServiceInfoSchema`, rawRes);
        for (const i of error.issues) {
          console.error("Type error:", i);
        }
      } else {
        console.error(`Info error:`, error);
      }
      throw new Error(`Info error: ${error}`);
    }
  }

  static async getStatus(): Promise<StatusResponse | null> {
    let rawRes;
    try {
      rawRes = await invoke("status");
      if (!rawRes) return null;
      return StatusResponseSchema.parse(rawRes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`Issues with StatusResponseSchema`, rawRes);
        for (const i of error.issues) {
          console.error("Type error:", i);
        }
      } else {
        console.error("Status error:", error);
      }
      throw new Error(`Status error: ${error}`);
    }
  }

  static async connect(id: string): Promise<ConnectResponse> {
    let rawRes;
    try {
      rawRes = await invoke("connect", { id });
      return ConnectResponseSchema.parse(rawRes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Issues with ConnectResponseSchema", rawRes);
        for (const i of error.issues) {
          console.error("Type error:", i);
        }
      } else {
        console.error("Connect error:", error);
      }
      throw new Error(`Connect error: ${error}`);
    }
  }

  static async disconnect(): Promise<DisconnectResponse> {
    let rawRes;
    try {
      rawRes = await invoke("disconnect");
      return DisconnectResponseSchema.parse(rawRes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Issues with DisconnectResponseSchema", rawRes);
        for (const i of error.issues) {
          console.error("Type error:", i);
        }
      } else {
        console.error("Disconnect error:", error);
      }
      throw new Error(`Disconnect error: ${error}`);
    }
  }

  static async balance(): Promise<BalanceResponse | null> {
    let rawRes;
    try {
      rawRes = await invoke("balance");
      if (!rawRes) return null;
      return BalanceResponseSchema.parse(rawRes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Issues with BalanceResponseSchema", rawRes);
        for (const i of error.issues) {
          console.error("Type error:", i);
        }
      } else {
        console.error("Balance error:", error);
      }
      throw new Error(`Balance error: ${error}`);
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

  static async compressLogs(logPath: string, destPath: string): Promise<void> {
    try {
      await invoke("compress_logs", { logPath, destPath });
    } catch (error) {
      console.error("Failed to compress logs", error);
      throw new Error(`Compress Logs Error: ${error}`);
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
