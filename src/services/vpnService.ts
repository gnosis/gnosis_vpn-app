import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// ==========================================
// Zod Schemas & Inferred Types
// ==========================================

// Unit variants arrive as {"type": "x"}; the app only ever needs the tag.
function unitVariant<const T extends readonly [string, ...string[]]>(
  values: T,
) {
  return z.object({ type: z.enum(values) }).transform((v) => v.type);
}

// In attempt order; StatusHero reads the order as progress.
export const CONNECT_PHASES = [
  "init",
  "gather_peer_ips",
  "killswitch_lockdown",
  "generating_wg",
  "register_wg",
  "opening_ping",
  "establish_wg_tunnel",
  "verify_ping",
  "adjust_to_main",
  "connection_established",
] as const;
export const ConnectPhaseSchema = unitVariant(CONNECT_PHASES);
export type ConnectPhase = z.infer<typeof ConnectPhaseSchema>;

export const DisconnectPhaseSchema = unitVariant([
  "disconnecting",
  "opening_bridge",
  "unregister_wg",
  "closing_bridge",
]);
export type DisconnectPhase = z.infer<typeof DisconnectPhaseSchema>;

export const TunnelStallSchema = z.object({
  since: z.number(),
  failed_pings: z.number(),
  // The daemon reconnects once failed_pings reaches this.
  reconnect_at: z.number(),
});
export type TunnelStall = z.infer<typeof TunnelStallSchema>;

export const ConnectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("disconnected") }),
  z.object({
    type: z.literal("connecting"),
    destination: z.string(),
    since: z.number(),
    phase: ConnectPhaseSchema,
  }),
  z.object({
    type: z.literal("reconnecting"),
    destination: z.string(),
    since: z.number(),
    // null while the daemon waits on route health before the next attempt.
    phase: ConnectPhaseSchema.nullable(),
  }),
  z.object({
    type: z.literal("connected"),
    destination: z.string(),
    since: z.number(),
    // Latest ICMP round trip through the tunnel, in ms.
    tunnel_ping_rtt: z.number().nullable(),
    stall: TunnelStallSchema.nullable(),
  }),
]);
export type Connection = z.infer<typeof ConnectionSchema>;

export const DisconnectingSchema = z.object({
  destination: z.string(),
  since: z.number(),
  phase: DisconnectPhaseSchema,
});
export type Disconnecting = z.infer<typeof DisconnectingSchema>;

// .catch(undefined): garbage from the server must never reach the CSS class string in Flag.tsx.
const FlagCodeSchema = z
  .string()
  .regex(/^[a-zA-Z]{2}$/)
  .transform((s) => s.toLowerCase())
  .optional()
  .catch(undefined);

// Operator-published labels: the keys the client recognizes, plus everything else it kept.
const MetaSchema = z.object({
  name: z.string().nullable(),
  description: z.string().nullable(),
  other: z.record(z.string(), z.string()),
});

// Derived by the client from the exit's announced address; source is informational, so any value parses.
const GeoSchema = z.object({
  country: FlagCodeSchema,
  source: z.object({ type: z.string() }),
});

export const DestinationSourceSchema = unitVariant([
  "configured",
  "discovered",
  "configured_and_discovered",
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
  geo: GeoSchema.nullable().optional(),
  address: z.string(),
  hops: z.number(),
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

// What an exit publishes about itself; server is absent on exits that predate publishing it.
export const ExitVersionsSchema = z.object({
  api: z.array(z.string()),
  server: z.string().nullable(),
});
export type ExitVersions = z.infer<typeof ExitVersionsSchema>;

export const UnrecoverableReasonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("not_allowed") }),
  z.object({
    type: z.literal("incompatible_api_version"),
    offered: z.array(z.string()),
  }),
  z.object({ type: z.literal("cannot_open_session"), error: z.string() }),
]);
export type UnrecoverableReason = z.infer<typeof UnrecoverableReasonSchema>;

// The daemon's verdict on whether a path to the exit exists; details live in the walk.
export const RouteHealthStateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("unrecoverable"),
    reason: UnrecoverableReasonSchema,
  }),
  z.object({ type: z.literal("not_routable") }),
  z.object({ type: z.literal("routable") }),
]);
export type RouteHealthState = z.infer<typeof RouteHealthStateSchema>;

// What the last graph walk found for this exit.
export const RouteWalkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("not_announced"), walked_at: z.number() }),
  // No path survived in at least one direction; the counts say which leg came up empty.
  z.object({
    type: z.literal("no_path"),
    walked_at: z.number(),
    forward_count: z.number(),
    return_count: z.number(),
  }),
  z.object({
    type: z.literal("paths"),
    walked_at: z.number(),
    count: z.number(),
    distinct_first_relays: z.number(),
    best_relays: z.array(z.string()),
    // In (0, 1]; higher is better.
    best_value: z.number(),
    // The exit -> me leg, same shape.
    return_count: z.number(),
    return_best_relays: z.array(z.string()),
    return_best_value: z.number(),
  }),
]);
export type RouteWalk = z.infer<typeof RouteWalkSchema>;

// What one quick probe measured; api_version null means no version we support.
export const QuickProbeCheckSchema = z.object({
  checked_at: z.number(),
  versions: ExitVersionsSchema,
  api_version: z.string().nullable(),
  load: HealthSchema,
  status_rtt: z.number(),
});
export type QuickProbeCheck = z.infer<typeof QuickProbeCheckSchema>;

// The last one-shot exit check; a running one carries the result it refreshes.
export const QuickProbeStateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("checking"),
    since: z.number(),
    last: QuickProbeCheckSchema.nullable(),
  }),
  QuickProbeCheckSchema.extend({ type: z.literal("checked") }),
  z.object({
    type: z.literal("failed"),
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

export const ProbeStateSchema = unitVariant([
  "opening",
  "checking",
  "ready",
  "reopening",
]);
export type ProbeState = z.infer<typeof ProbeStateSchema>;

// The one long-lived probe session and the latest result of each of its checks.
export const ProbeViewSchema = z.object({
  destination: z.string(),
  state: ProbeStateSchema,
  session_since: z.number().nullable(),
  versions: ExitVersionsSchema.nullable(),
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
    type: z.literal("already_connected"),
    destination: DestinationSchema,
  }),
  z.object({ type: z.literal("connecting"), destination: DestinationSchema }),
  z.object({
    type: z.literal("waiting_to_connect"),
    destination: DestinationSchema,
    route_health: RouteHealthStateSchema,
  }),
  z.object({
    type: z.literal("unable_to_connect"),
    destination: DestinationSchema,
    route_health: RouteHealthStateSchema,
  }),
  z.object({ type: z.literal("destination_not_found") }),
  // One exit reachable by several paths; the user has to pick one of the candidate ids.
  z.object({
    type: z.literal("destination_ambiguous"),
    candidates: z.array(z.string()),
  }),
]);
export type ConnectResponse = z.infer<typeof ConnectResponseSchema>;

export const DisconnectResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("disconnecting"),
    destination: DestinationSchema,
  }),
  z.object({ type: z.literal("not_connected") }),
]);
export type DisconnectResponse = z.infer<typeof DisconnectResponseSchema>;

export const ProbeResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("probing"), destination: DestinationSchema }),
  // Only one probe exists; this one took the place of `previous`.
  z.object({
    type: z.literal("replaced"),
    destination: DestinationSchema,
    previous: DestinationSchema,
  }),
  z.object({
    type: z.literal("already_probing"),
    destination: DestinationSchema,
  }),
  // A connection still needs this probe's session, so it cannot be replaced yet.
  z.object({ type: z.literal("in_use"), destination: DestinationSchema }),
  z.object({
    type: z.literal("unable_to_probe"),
    destination: DestinationSchema,
    route_health: RouteHealthStateSchema,
  }),
  z.object({ type: z.literal("not_ready") }),
  z.object({ type: z.literal("destination_not_found") }),
  z.object({
    type: z.literal("destination_ambiguous"),
    candidates: z.array(z.string()),
  }),
]);
export type ProbeResponse = z.infer<typeof ProbeResponseSchema>;

export const UnprobeResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("closing"), destination: DestinationSchema }),
  // A connection attempt is registering over the session right now.
  z.object({ type: z.literal("in_use"), destination: DestinationSchema }),
  z.object({ type: z.literal("not_probing") }),
]);
export type UnprobeResponse = z.infer<typeof UnprobeResponseSchema>;

// Accepted checks run in the background; their result shows up under the destination's route health.
export const QuickProbeResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("checking"), destination: DestinationSchema }),
  z.object({
    type: z.literal("unable_to_probe"),
    destination: DestinationSchema,
    route_health: RouteHealthStateSchema,
  }),
  z.object({
    type: z.literal("already_probing"),
    destination: DestinationSchema,
  }),
  z.object({
    type: z.literal("already_checking"),
    destination: DestinationSchema,
  }),
  z.object({ type: z.literal("not_ready") }),
  z.object({ type: z.literal("destination_not_found") }),
  z.object({
    type: z.literal("destination_ambiguous"),
    candidates: z.array(z.string()),
  }),
]);
export type QuickProbeResponse = z.infer<typeof QuickProbeResponseSchema>;

// Wei arrives as a decimal string since JSON numbers stop at 2^53; bigint at the boundary rejects malformed values early.
const BigIntStringSchema = z.string().transform((s) => BigInt(s));

export const FundingLevelSchema = unitVariant(["good", "low", "empty"]);
export type FundingLevel = z.infer<typeof FundingLevelSchema>;

// Traffic/gas health, already pooled by the daemon, plus how much more is needed.
export const FundingStatusSchema = z.object({
  traffic: FundingLevelSchema,
  gas: FundingLevelSchema,
  wxhopr_deficit: BigIntStringSchema.nullable(),
  xdai_deficit: BigIntStringSchema.nullable(),
  // wxHOPR the Safe lacks for the next channel top-up pass; set only while traffic is capped at low.
  refill_shortfall: BigIntStringSchema.nullable(),
});
export type FundingStatus = z.infer<typeof FundingStatusSchema>;

export const BalanceRecommendationSchema = z.object({
  wxhopr: BigIntStringSchema,
  xdai: BigIntStringSchema,
  channel_stakes: BigIntStringSchema,
  fee_to_start: BigIntStringSchema,
  txs_to_start: z.number(),
  xdai_fee_per_tx: BigIntStringSchema,
  // What the next top-up pass will try to spend; not part of `wxhopr`.
  topup_headroom: BigIntStringSchema,
});
export type BalanceRecommendation = z.infer<typeof BalanceRecommendationSchema>;

export const CapacitySchema = z.object({
  stake: BigIntStringSchema,
  expected_messages: z.number(),
  min_guaranteed_messages: z.number(),
  byte_capacity: z.number(),
});
export type Capacity = z.infer<typeof CapacitySchema>;

// Open outgoing channels keyed by checksum address, wxHOPR on the node EOA (not yet swept into the Safe), and the unallocated Safe balance.
export const CapacityAllocationsSchema = z.object({
  peer_allocations: z.record(z.string(), CapacitySchema),
  node: CapacitySchema,
  safe: CapacitySchema,
});
export type CapacityAllocations = z.infer<typeof CapacityAllocationsSchema>;

export const WarmupStageSchema = unitVariant([
  "initializing",
  "validating_config",
  "identifying_node",
  "connecting_blockchain",
  "creating_node",
  "starting_node",
  "ready",
  "uninitialized",
  "waiting_for_funds",
  "checking_balance",
  "validating_network_config",
  "checking_onchain_address",
  "registering_safe",
  "announcing_node",
  "awaiting_key_binding",
  "initializing_services",
  "running",
  "terminated",
  "degraded",
  "failed",
]);
export type WarmupStage = z.infer<typeof WarmupStageSchema>;

export const HoprStatusSchema = unitVariant([
  "uninitialized",
  "waiting_for_funds",
  "checking_balance",
  "validating_network_config",
  "checking_onchain_address",
  "registering_safe",
  "announcing_node",
  "awaiting_key_binding",
  "initializing_services",
  "running",
  "terminated",
  "degraded",
  "failed",
]);
export type HoprStatus = z.infer<typeof HoprStatusSchema>;

// Unavailable after three failed maintenance samples in a row; `since` is ms since epoch.
export const ChannelMaintenanceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ok") }),
  z.object({ type: z.literal("unavailable"), since: z.number() }),
]);
export type ChannelMaintenance = z.infer<typeof ChannelMaintenanceSchema>;

export const InitSchema = z.object({
  type: z.literal("init"),
  last_error: z.string().nullable(),
});
export type Init = z.infer<typeof InitSchema>;

export const PreparingSafeSchema = z.object({
  type: z.literal("preparing_safe"),
  node_address: z.string(),
  node_xdai: BigIntStringSchema,
  node_wxhopr: BigIntStringSchema,
  funding_tool: z.string().nullable(),
  error: z.string().nullable(),
  balance_recommendation: BalanceRecommendationSchema.nullable(),
});
export type PreparingSafe = z.infer<typeof PreparingSafeSchema>;

export const DeployingSafeSchema = z.object({
  type: z.literal("deploying_safe"),
  node_address: z.string(),
});
export type DeployingSafe = z.infer<typeof DeployingSafeSchema>;

export const WarmupSchema = z.object({
  type: z.literal("warmup"),
  stage: WarmupStageSchema,
  last_error: z.string().nullable(),
});
export type Warmup = z.infer<typeof WarmupSchema>;

export const RunningSchema = z.object({
  type: z.literal("running"),
  hopr_status: HoprStatusSchema.nullable(),
  funding_status: FundingStatusSchema.nullable(),
  channel_maintenance: ChannelMaintenanceSchema,
});
export type Running = z.infer<typeof RunningSchema>;

export const RunModeSchema = z.discriminatedUnion("type", [
  InitSchema,
  PreparingSafeSchema,
  DeployingSafeSchema,
  WarmupSchema,
  RunningSchema,
  z.object({ type: z.literal("shutdown") }),
  z.object({ type: z.literal("restarting") }),
  z.object({ type: z.literal("not_running") }),
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
  // Where the service is headed; set before and during every connection attempt.
  target: z.string().nullable(),
  connection: ConnectionSchema,
  // Teardowns run in the background and may overlap a new connection.
  disconnecting: z.array(DisconnectingSchema),
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
  // Null for a non-owner: the daemon keeps another user's home path to itself.
  worker_log_dir: z.string().nullable(),
});
export type ServiceInfo = z.infer<typeof ServiceInfoSchema>;

/** Status `Err` payload for a missing daemon socket; mirrors SERVICE_NOT_RUNNING_ERROR in commands.rs. */
export const SERVICE_NOT_RUNNING_ERROR = "service_not_running";
/** Status `Err` payload while another local user owns the worker; mirrors IN_USE_BY_OTHER_USER_ERROR in commands.rs. */
export const IN_USE_BY_OTHER_USER_ERROR = "in_use_by_other_user";

export const ServiceNotRunningInfoSchema = z.object({
  platform: z.string(),
  migrate_log_paths: z.array(z.string()),
  start_command: z.string(),
  migration_pending: z.boolean(),
  migrate_commands: z.object({
    has_own_identity: z.boolean(),
    identity: z.string(),
    upload_log: z.string(),
    start_clean: z.string(),
  }).nullable(),
  can_start_from_app: z.boolean(),
});
export type ServiceNotRunningInfo = z.infer<typeof ServiceNotRunningInfoSchema>;

// ==========================================
// Helper Functions
// ==========================================

export function formatWarmupStatus(stage: WarmupStage): string {
  switch (stage) {
    case "initializing":
      return "Initializing edge client";
    case "validating_config":
      return "Validating edge client configuration";
    case "identifying_node":
      return "Identifying ourselves";
    case "connecting_blockchain":
      return "Querying ledger";
    case "creating_node":
      return "Creating edge client runtime";
    case "starting_node":
      return "Starting edge client runtime";
    case "ready":
      return "Edge client runtime ready for action";
    case "uninitialized":
      return "Orienting ourselves";
    case "waiting_for_funds":
      return "Waiting to get funded";
    case "checking_balance":
      return "Checking funding state";
    case "validating_network_config":
      return "Validating network configuration";
    case "checking_onchain_address":
      return "Checking onchain address";
    case "registering_safe":
      return "Registering safe identity";
    case "announcing_node":
      return "Announcing ourselves";
    case "awaiting_key_binding":
      return "Waiting for ledger verification";
    case "initializing_services":
      return "Initializing service layers";
    case "running":
      return "Running";
    case "terminated":
      return "Terminated";
    case "degraded":
      return "Degraded";
    case "failed":
      return "Failed";
  }
}

/** Init precedes the edge client and reads as its first warmup stage. */
export function warmupProgress(
  rm: RunMode | null | undefined,
): { stage: WarmupStage; last_error: string | null } | null {
  if (rm?.type === "init") {
    return { stage: "initializing", last_error: rm.last_error };
  }
  if (rm?.type === "warmup") {
    return { stage: rm.stage, last_error: rm.last_error };
  }
  return null;
}

export function isPreparingSafeRunMode(
  rm: RunMode | null | undefined,
): rm is PreparingSafe {
  return rm?.type === "preparing_safe";
}

export function isDeployingSafeRunMode(
  rm: RunMode | null | undefined,
): rm is DeployingSafe {
  return rm?.type === "deploying_safe";
}

export function isRunningRunMode(
  rm: RunMode | null | undefined,
): rm is Running {
  return rm?.type === "running";
}

/** The exit a connection is up, coming up or coming back on. */
export function connectionDestination(connection: Connection): string | null {
  return connection.type === "disconnected" ? null : connection.destination;
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

  /** Points the daemon's one probe session at `id`; the result streams in through status. */
  static async probe(id: string): Promise<ProbeResponse> {
    let rawRes;
    try {
      rawRes = await invoke("probe", { id });
      return ProbeResponseSchema.parse(rawRes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Issues with ProbeResponseSchema", rawRes);
        VPNService.logZodIssues("probe response", error);
      }
      throw new Error(`Probe error: ${error}`);
    }
  }

  /** What the "service not running" screen shows: OS-specific paths, commands and whether a button can start it. */
  static async serviceNotRunningInfo(): Promise<ServiceNotRunningInfo> {
    let rawRes;
    try {
      rawRes = await invoke("get_service_not_running_info");
      return ServiceNotRunningInfoSchema.parse(rawRes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Issues with ServiceNotRunningInfoSchema", rawRes);
        VPNService.logZodIssues("service not running info", error);
      }
      throw new Error(`Service info error: ${error}`);
    }
  }

  /** macOS only: `sudo -n launchctl bootstrap` through the installer's sudoers rule; rejects with the reason. */
  static async startService(): Promise<void> {
    await invoke("start_service");
  }

  /** One-shot check of `id`; the daemon answers at once and reports the result under the destination. */
  static async quickProbe(id: string): Promise<QuickProbeResponse> {
    let rawRes;
    try {
      rawRes = await invoke("quick_probe", { id });
      return QuickProbeResponseSchema.parse(rawRes);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Issues with QuickProbeResponseSchema", rawRes);
        VPNService.logZodIssues("quick probe response", error);
      }
      throw new Error(`Quick probe error: ${error}`);
    }
  }

  /** Caps the status poll interval while the list is open; quick-probe results should not wait 2 s. */
  static async setStatusPollFast(fast: boolean): Promise<void> {
    try {
      await invoke("set_status_poll_fast", { fast });
    } catch (error) {
      throw new Error(`Set status poll error: ${error}`);
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

  // failures are logged by the backend's upload_logs command
  static async uploadLogs(
    fileName: string,
    description: string,
  ): Promise<string> {
    try {
      const referenceId = await invoke<unknown>("upload_logs", {
        fileName,
        description,
      });
      return z.string().min(1).parse(referenceId);
    } catch (error) {
      throw new Error(`Upload Logs Error: ${error}`);
    }
  }

  static async getLogUploaderWebsiteUrl(): Promise<string> {
    try {
      const url = await invoke<unknown>("get_log_uploader_website_url");
      return z.url().parse(url);
    } catch (error) {
      throw new Error(`Log Uploader URL Error: ${error}`);
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
