import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// ==========================================
// Zod Schemas & Inferred Types
// ==========================================

export const UpPhaseSchema = z.enum([
  "Init",
  "ResolvingBlokliIps",
  "GeneratingWg",
  "OpeningBridge",
  "RegisterWg",
  "OpeningPing",
  "GatherPeerIps",
  "KillswitchLockdown",
  "EstablishWgTunnel",
  "VerifyPing",
  "AdjustToMain",
  "ConnectionEstablished",
]);
export type UpPhase = z.infer<typeof UpPhaseSchema>;

export const DownPhaseSchema = z.enum([
  "Disconnecting",
  "OpeningBridge",
  "UnregisterWg",
  "ClosingBridge",
]);
export type DownPhase = z.infer<typeof DownPhaseSchema>;

export const ConnectedInfoSchema = z.object({
  destination_id: z.string(),
  since: z.number(),
  // Latest ICMP round trip through the tunnel, in ms.
  tunnel_ping_rtt: z.number().nullable(),
});
export type ConnectedInfo = z.infer<typeof ConnectedInfoSchema>;

export const ConnectingInfoSchema = z.object({
  destination_id: z.string(),
  since: z.number(),
  phase: UpPhaseSchema,
});
export type ConnectingInfo = z.infer<typeof ConnectingInfoSchema>;

export const ReconnectingInfoSchema = z.object({
  destination_id: z.string(),
  since: z.number(),
  // null while the daemon waits on route health before the next attempt.
  phase: UpPhaseSchema.nullable(),
});
export type ReconnectingInfo = z.infer<typeof ReconnectingInfoSchema>;

export const DisconnectingInfoSchema = z.object({
  destination_id: z.string(),
  since: z.number(),
  phase: DownPhaseSchema,
});
export type DisconnectingInfo = z.infer<typeof DisconnectingInfoSchema>;

// ISO 3166-1 alpha-2, optionally followed by "-" and a subdivision suffix
// (e.g. GB-SCT), normalized to lowercase. The suffix length isn't capped to
// the standard's 1-3 chars: Flag.tsx falls back to the alpha-2 prefix for any
// subdivision it has no art for, and a malformed suffix should fall back the
// same way rather than have the whole flag dropped here.
// .catch(undefined) silently drops any value that doesn't match so garbage
// from the server never reaches the CSS class string in Flag.tsx.
const FlagCodeSchema = z
  .string()
  .regex(/^[a-zA-Z]{2}(-[a-zA-Z0-9]+)?$/)
  .transform((s) => s.toLowerCase())
  .optional()
  .catch(undefined);

// Operator-published labels: the keys the client recognizes, plus everything else it kept.
const MetaSchema = z.object({
  name: z.string().nullable(),
  location: z.string().nullable(),
  flag: FlagCodeSchema,
  description: z.string().nullable(),
  other: z.record(z.string(), z.string()),
});

export const DestinationSourceSchema = z.enum([
  "Configured",
  "Discovered",
  "ConfiguredAndDiscovered",
]);
export type DestinationSource = z.infer<typeof DestinationSourceSchema>;

// What configuration pinned for this destination; every key present is a pin.
const OverridesSchema = z.object({
  configured_meta: z.record(z.string(), z.string()),
  configured_gnosis_vpn_server: z.string().nullable(),
  configured_wireguard_server: z.string().nullable(),
});

export const DestinationSchema = z.object({
  id: z.string(),
  meta: MetaSchema,
  address: z.string(),
  routing: z.number(),
  gnosis_vpn_server: z.string(),
  wireguard_server: z.string(),
  source: DestinationSourceSchema,
  // The daemon always sends this; defaulted so a missing one degrades to "nothing pinned".
  overrides: OverridesSchema.default({
    configured_meta: {},
    configured_gnosis_vpn_server: null,
    configured_wireguard_server: null,
  }),
});
export type Destination = z.infer<typeof DestinationSchema>;

export const SlotsSchema = z.object({
  total: z.number(),
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

export const HealthSchema = z.object({
  slots: SlotsSchema,
  load_avg: LoadAvgSchema,
});
export type Health = z.infer<typeof HealthSchema>;

export const VersionsSchema = z.object({
  versions: z.array(z.string()),
  latest: z.string(),
});
export type Versions = z.infer<typeof VersionsSchema>;

export const UnrecoverableReasonSchema = z.union([
  z.literal("NotAllowed"),
  z.object({
    IncompatibleApiVersion: z.object({ server_versions: z.array(z.string()) }),
  }),
]);
export type UnrecoverableReason = z.infer<typeof UnrecoverableReasonSchema>;

// The daemon's verdict on whether a path to the exit exists; details live in the walk.
export const RouteHealthStateSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("Unrecoverable"),
    reason: UnrecoverableReasonSchema,
  }),
  z.object({ state: z.literal("NotRoutable") }),
  z.object({ state: z.literal("Routable") }),
]);
export type RouteHealthState = z.infer<typeof RouteHealthStateSchema>;

// What the last graph walk found for this exit.
export const RouteWalkSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal("NotAnnounced"), walked_at: z.number() }),
  z.object({ found: z.literal("NoPath"), walked_at: z.number() }),
  z.object({
    found: z.literal("Paths"),
    walked_at: z.number(),
    count: z.number(),
    distinct_first_relays: z.number(),
    best_relays: z.array(z.string()),
    // In (0, 1]; higher is better.
    best_value: z.number(),
  }),
]);
export type RouteWalk = z.infer<typeof RouteWalkSchema>;

// The last one-shot exit check; api_version null means no version we support.
export const QuickProbeStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("Checking"), since: z.number() }),
  z.object({
    state: z.literal("Checked"),
    checked_at: z.number(),
    versions: VersionsSchema,
    api_version: z.string().nullable(),
    load: HealthSchema,
    rtt: z.number(),
  }),
  z.object({
    state: z.literal("Failed"),
    checked_at: z.number(),
    error: z.string(),
  }),
]);
export type QuickProbeState = z.infer<typeof QuickProbeStateSchema>;

export const RouteHealthViewSchema = z.object({
  state: RouteHealthStateSchema,
  last_error: z.string().nullable(),
  walk: RouteWalkSchema.nullable(),
  quick_probe: QuickProbeStateSchema.nullable(),
});
export type RouteHealthView = z.infer<typeof RouteHealthViewSchema>;

export const ProbeStateSchema = z.object({
  state: z.enum(["Opening", "Checking", "Ready", "Reopening"]),
});
export type ProbeState = z.infer<typeof ProbeStateSchema>;

// The one long-lived probe session and the latest result of each of its checks.
export const ProbeViewSchema = z.object({
  destination_id: z.string(),
  state: ProbeStateSchema,
  session_since: z.number().nullable(),
  versions: VersionsSchema.nullable(),
  api_version: z.string().nullable(),
  ping_rtt: z.number().nullable(),
  load: HealthSchema.nullable(),
  checked_at: z.number().nullable(),
  consecutive_failures: z.number(),
  last_error: z.string().nullable(),
});
export type ProbeView = z.infer<typeof ProbeViewSchema>;

export const DestinationStateSchema = z.object({
  destination: DestinationSchema,
  route_health: RouteHealthViewSchema.nullable(),
});
export type DestinationState = z.infer<typeof DestinationStateSchema>;

export const ConnectResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("AlreadyConnected"),
    destination: DestinationSchema,
  }),
  z.object({ type: z.literal("Connecting"), destination: DestinationSchema }),
  z.object({
    type: z.literal("WaitingToConnect"),
    destination: DestinationSchema,
    route_health: RouteHealthStateSchema,
  }),
  z.object({
    type: z.literal("UnableToConnect"),
    destination: DestinationSchema,
    route_health: RouteHealthStateSchema,
  }),
  z.object({ type: z.literal("DestinationNotFound") }),
  // One exit reachable by several paths; the user has to pick a connect id.
  z.object({
    type: z.literal("DestinationAmbiguous"),
    connect_ids: z.array(z.string()),
  }),
]);
export type ConnectResponse = z.infer<typeof ConnectResponseSchema>;

export const DisconnectResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Disconnecting"),
    destination: DestinationSchema,
  }),
  z.object({ type: z.literal("NotConnected") }),
]);
export type DisconnectResponse = z.infer<typeof DisconnectResponseSchema>;

export const ProbeResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Probing"), destination: DestinationSchema }),
  // Only one probe exists; this one took the place of `previous`.
  z.object({
    type: z.literal("Replaced"),
    destination: DestinationSchema,
    previous: DestinationSchema,
  }),
  z.object({
    type: z.literal("AlreadyProbing"),
    destination: DestinationSchema,
  }),
  z.object({
    type: z.literal("UnableToProbe"),
    destination: DestinationSchema,
    route_health: RouteHealthStateSchema,
  }),
  z.object({ type: z.literal("NotReady") }),
  z.object({ type: z.literal("DestinationNotFound") }),
  z.object({
    type: z.literal("DestinationAmbiguous"),
    connect_ids: z.array(z.string()),
  }),
]);
export type ProbeResponse = z.infer<typeof ProbeResponseSchema>;

export const UnprobeResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Closing"), destination: DestinationSchema }),
  // A connection attempt is registering over the session right now.
  z.object({ type: z.literal("InUse"), destination: DestinationSchema }),
  z.object({ type: z.literal("NotProbing") }),
]);
export type UnprobeResponse = z.infer<typeof UnprobeResponseSchema>;

// Accepted checks run in the background; their result shows up under the destination's route health.
export const QuickProbeResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Checking"), destination: DestinationSchema }),
  z.object({
    type: z.literal("UnableToProbe"),
    destination: DestinationSchema,
    route_health: RouteHealthStateSchema,
  }),
  z.object({
    type: z.literal("AlreadyProbing"),
    destination: DestinationSchema,
  }),
  z.object({
    type: z.literal("AlreadyChecking"),
    destination: DestinationSchema,
  }),
  z.object({ type: z.literal("NotReady") }),
  z.object({ type: z.literal("DestinationNotFound") }),
  z.object({
    type: z.literal("DestinationAmbiguous"),
    connect_ids: z.array(z.string()),
  }),
]);
export type QuickProbeResponse = z.infer<typeof QuickProbeResponseSchema>;

// Hopli amounts arrive as raw wei integer strings (e.g. "1000000000000000000").
// Transforming to bigint at the boundary catches malformed values early and
// removes the need for BigInt() calls throughout the codebase.
const BigIntStringSchema = z.string().transform((s) => BigInt(s));

export const FundingLevelSchema = z.enum(["Good", "Low", "Empty"]);
export type FundingLevel = z.infer<typeof FundingLevelSchema>;

// Traffic/gas health, already pooled by the daemon, plus how much more is needed.
export const FundingStatusSchema = z.object({
  traffic: FundingLevelSchema,
  gas: FundingLevelSchema,
  wxhopr_deficit: BigIntStringSchema.nullable(),
  xdai_deficit: BigIntStringSchema.nullable(),
});
export type FundingStatus = z.infer<typeof FundingStatusSchema>;

export const BalanceRecommendationSchema = z.object({
  wxhopr: BigIntStringSchema,
  xdai: BigIntStringSchema,
  channel_stakes: BigIntStringSchema,
  fee_to_start: BigIntStringSchema,
  txs_to_start: z.number(),
  xdai_fee_per_tx: BigIntStringSchema,
});
export type BalanceRecommendation = z.infer<typeof BalanceRecommendationSchema>;

export const CapacitySchema = z.object({
  stake: BigIntStringSchema,
  expected_messages: z.number(),
  min_guaranteed_messages: z.number(),
  byte_capacity: z.number(),
});
export type Capacity = z.infer<typeof CapacitySchema>;

// Mirror of the daemon's CapacityAllocations struct: open outgoing channels
// keyed by checksum address, wxHOPR on the node EOA (not yet swept into the
// Safe), and the unallocated Safe balance.
export const CapacityAllocationsSchema = z.object({
  peer_allocations: z.record(z.string(), CapacitySchema),
  node: CapacitySchema,
  safe: CapacitySchema,
});
export type CapacityAllocations = z.infer<typeof CapacityAllocationsSchema>;

export const PreparingSafeSchema = z.object({
  node_address: z.string(),
  node_xdai: BigIntStringSchema,
  node_wxhopr: BigIntStringSchema,
  funding_tool: z.string().nullable(),
  error: z.string().nullable(),
  balance_recommendation: BalanceRecommendationSchema.nullable(),
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
  "ConnectingBlockchain",
  "CreatingNode",
  "StartingNode",
  "Ready",
  "Uninitialized",
  "WaitingForFunds",
  "CheckingBalance",
  "ValidatingNetworkConfig",
  "CheckingOnchainAddress",
  "RegisteringSafe",
  "AnnouncingNode",
  "AwaitingKeyBinding",
  "InitializingServices",
  "Running",
  "Terminated",
  "Degraded",
  "Failed",
]);
export type WarmupStatus = z.infer<typeof WarmupStatusSchema>;

export const WarmupSchema = z.object({
  status: WarmupStatusSchema,
  last_error: z.string().nullable(),
});
export type Warmup = z.infer<typeof WarmupSchema>;

export const RunningSchema = z.object({
  funding_status: FundingStatusSchema.nullable(),
  hopr_status: WarmupStatusSchema.nullable(),
});
export type Running = z.infer<typeof RunningSchema>;

export const RunModeSchema = z.union([
  z.object({ PreparingSafe: PreparingSafeSchema }),
  z.object({ DeployingSafe: DeployingSafeSchema }),
  z.object({ Warmup: WarmupSchema }),
  z.object({ Running: RunningSchema }),
  z.literal("Shutdown"),
  z.literal("Restarting"),
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
  target_destination: z.string().nullable(),
  connected: ConnectedInfoSchema.nullable(),
  connecting: ConnectingInfoSchema.nullable(),
  reconnecting: ReconnectingInfoSchema.nullable(),
  disconnecting: z.array(DisconnectingInfoSchema),
  probe: ProbeViewSchema.nullable(),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export const BalanceResponseSchema = z.object({
  node: BigIntStringSchema,
  safe: BigIntStringSchema,
  channels_out: BigIntStringSchema,
  info: InfoSchema,
  funding_status: FundingStatusSchema.nullable(),
  ideal_balance: BalanceRecommendationSchema.nullable(),
  capacity_allocations: CapacityAllocationsSchema.nullable(),
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
    case "CheckingOnchainAddress":
      return "Checking onchain address";
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
    case "Degraded":
      return "Degraded";
    case "Failed":
      return "Failed";
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
  // Schema mismatches are frontend-only knowledge; persist them before rethrowing.
  private static logZodIssues(context: string, error: z.ZodError): void {
    const issues = error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    VPNService.logToFile("error", `${context} schema mismatch: ${issues}`);
  }

  static async connect(id: string): Promise<ConnectResponse> {
    let rawRes;
    try {
      rawRes = await invoke("connect", { id });
      return ConnectResponseSchema.parse(rawRes);
    } catch (error) {
      // callers log the rethrown message; only the schema detail is added here
      if (error instanceof z.ZodError) {
        console.error("Issues with ConnectResponseSchema", rawRes);
        VPNService.logZodIssues("connect response", error);
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
        VPNService.logZodIssues("disconnect response", error);
      }
      throw new Error(`Disconnect error: ${error}`);
    }
  }

  // failures are logged by the backend's export_logs command
  static async exportLogs(destPath: string): Promise<string> {
    try {
      return await invoke<string>("export_logs", { destPath });
    } catch (error) {
      throw new Error(`Export Logs Error: ${error}`);
    }
  }

  // Fire-and-forget: log persistence must never break the caller.
  static logToFile(level: "info" | "warn" | "error", message: string): void {
    invoke("log_from_frontend", { level, message }).catch(() => {});
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
