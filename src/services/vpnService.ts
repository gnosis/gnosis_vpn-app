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

export const ConnectingInfoSchema = z.object({
  destination_id: z.string(),
  phase: UpPhaseSchema,
});
export type ConnectingInfo = z.infer<typeof ConnectingInfoSchema>;

export const DisconnectingInfoSchema = z.object({
  destination_id: z.string(),
  phase: DownPhaseSchema,
});
export type DisconnectingInfo = z.infer<typeof DisconnectingInfoSchema>;

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

export const ExitHealthDataSchema = z.object({
  checked_at: SerializedSinceTimeSchema,
  versions: z.object({ versions: z.array(z.string()), latest: z.string() }),
  ping_rtt: SerializedTimeSchema,
  health: ExitHealthSchema,
});
export type ExitHealthData = z.infer<typeof ExitHealthDataSchema>;

export const UnrecoverableReasonSchema = z.union([
  z.literal("NotAllowed"),
  z.literal("InvalidId"),
  z.literal("InvalidPath"),
  z.object({
    IncompatibleApiVersion: z.object({ server_versions: z.array(z.string()) }),
  }),
]);
export type UnrecoverableReason = z.infer<typeof UnrecoverableReasonSchema>;

export const RouteHealthStateSchema = z.union([
  z.object({ Unrecoverable: z.object({ reason: UnrecoverableReasonSchema }) }),
  z.object({ NeedsPeering: z.object({ funded: z.boolean() }) }),
  z.literal("NeedsFunding"),
  z.literal("Routable"),
  z.object({ ReadyToConnect: z.object({ exit: ExitHealthDataSchema }) }),
  z.object({
    Connecting: z.object({
      exit: ExitHealthDataSchema,
      tunnel_ping_rtt: SerializedTimeSchema.nullable(),
    }),
  }),
]);
export type RouteHealthState = z.infer<typeof RouteHealthStateSchema>;

export const RouteHealthViewSchema = z.object({
  state: RouteHealthStateSchema,
  last_error: z.string().nullable(),
  checking_since: SerializedSinceTimeSchema.nullable(),
  consecutive_failures: z.number(),
});
export type RouteHealthView = z.infer<typeof RouteHealthViewSchema>;

export const DestinationStateSchema = z.object({
  destination: DestinationSchema,
  route_health: RouteHealthViewSchema.nullable(),
});
export type DestinationState = z.infer<typeof DestinationStateSchema>;

export const ConnectResponseSchema = z.union([
  z.object({ AlreadyConnected: DestinationSchema }),
  z.object({ Connecting: DestinationSchema }),
  z.object({
    WaitingToConnect: z.tuple([DestinationSchema, RouteHealthStateSchema]),
  }),
  z.object({
    UnableToConnect: z.tuple([DestinationSchema, RouteHealthStateSchema]),
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

export const TicketStatsSchema = z.object({
  ticket_price: z.string(),
  winning_probability: z.number(),
});
export type TicketStats = z.infer<typeof TicketStatsSchema>;

export const PreparingSafeSchema = z.object({
  node_address: z.string(),
  node_xdai: z.string(),
  node_wxhopr: z.string(),
  funding_tool: z.string().nullable(),
  error: z.string().nullable(),
  ticket_stats: TicketStatsSchema.nullable(),
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
  z.literal("NotRunning"),
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
  connected: z.string().nullable(),
  connecting: ConnectingInfoSchema.nullable(),
  disconnecting: z.array(DisconnectingInfoSchema),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export const BalanceResponseSchema = z.object({
  node: z.string(),
  safe: z.string(),
  channels_out: z.string(),
  info: InfoSchema,
  issues: z.array(FundingIssueSchema),
  ticket_stats: TicketStatsSchema,
});
export type BalanceResponse = z.infer<typeof BalanceResponseSchema>;

export const ServiceInfoSchema = z.object({
  version: z.string(),
  package_version: z.string().nullable(),
  log_file: z.string().nullable(),
});
export type ServiceInfo = z.infer<typeof ServiceInfoSchema>;

// ==========================================
// Helper Functions
// ==========================================

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

  static async startStatusPolling(): Promise<void> {
    try {
      await invoke("start_status_polling");
    } catch (error) {
      console.error("Failed to start status polling", error);
      throw new Error(`StartStatusPolling Error: ${error}`);
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

  static getBestDestination(ds_states: StatusResponse["destinations"]): string {
    // when we have an actual StatusResponse, destinations can never be empty
    // Thats why we do not need to check for that case
    const sorted = Object.values(ds_states).sort((a, b) =>
      a.destination.id.localeCompare(b.destination.id)
    );
    return sorted[0].destination.id;
  }
}
