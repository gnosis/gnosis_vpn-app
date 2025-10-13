import {
  type Destination,
  type FundingState,
  PreparingSafe,
  RunMode,
  Warmup,
} from "@src/services/vpnService.ts";
import type { AppState } from "@src/stores/appStore.ts";

export function isConnected(
  state: AppState,
): state is AppState & {
  runMode: {
    Running: { connection: { Connected: Destination }; funding: FundingState };
  };
} {
  const runMode: RunMode | null | undefined = state?.runMode;
  if (!runMode || typeof runMode !== "object") return false;
  return (
    "Running" in runMode &&
    typeof (runMode as { Running: unknown }).Running === "object" &&
    "connection" in (runMode as { Running: { connection: unknown } }).Running &&
    typeof (runMode as { Running: { connection: unknown } }).Running
        .connection === "object" &&
    "Connected" in
      (runMode as { Running: { connection: Record<string, unknown> } }).Running
        .connection
  );
}

export function isConnecting(
  state: AppState,
): state is AppState & {
  runMode: {
    Running: { connection: { Connecting: Destination }; funding: FundingState };
  };
} {
  const runMode: RunMode | null | undefined = state?.runMode;
  if (!runMode || typeof runMode !== "object") return false;
  return (
    "Running" in runMode &&
    typeof (runMode as { Running: unknown }).Running === "object" &&
    "connection" in (runMode as { Running: { connection: unknown } }).Running &&
    typeof (runMode as { Running: { connection: unknown } }).Running
        .connection === "object" &&
    "Connecting" in
      (runMode as { Running: { connection: Record<string, unknown> } }).Running
        .connection
  );
}

export function isDisconnecting(
  state: AppState,
): state is AppState & {
  runMode: {
    Running: {
      connection: { Disconnecting: Destination };
      funding: FundingState;
    };
  };
} {
  const runMode: RunMode | null | undefined = state?.runMode;
  if (!runMode || typeof runMode !== "object") return false;
  return (
    "Running" in runMode &&
    typeof (runMode as { Running: unknown }).Running === "object" &&
    "connection" in (runMode as { Running: { connection: unknown } }).Running &&
    typeof (runMode as { Running: { connection: unknown } }).Running
        .connection === "object" &&
    "Disconnecting" in
      (runMode as { Running: { connection: Record<string, unknown> } }).Running
        .connection
  );
}

export function isDisconnected(state: AppState): boolean {
  const runMode: RunMode | null | undefined = state?.runMode;
  return (
    !!runMode &&
    typeof runMode === "object" &&
    "Running" in runMode &&
    typeof (runMode as { Running: unknown }).Running === "object" &&
    "connection" in (runMode as { Running: { connection: unknown } }).Running &&
    (runMode as { Running: { connection: unknown } }).Running.connection ===
      "Disconnected"
  );
}

export function isServiceUnavailable(state: AppState): boolean {
  const runMode: RunMode | null | undefined = state?.runMode;
  return (
    !!runMode &&
    typeof runMode === "object" &&
    "Running" in runMode &&
    typeof (runMode as { Running: unknown }).Running === "object" &&
    "connection" in (runMode as { Running: { connection: unknown } }).Running &&
    (runMode as { Running: { connection: unknown } }).Running.connection ===
      "ServiceUnavailable"
  );
}

export function isConnectedTo(
  state: AppState,
  destination: Destination,
): boolean {
  return isConnected(state) &&
    state.runMode.Running.connection.Connected.address === destination.address;
}

export function isConnectingTo(
  state: AppState,
  destination: Destination,
): boolean {
  return isConnecting(state) &&
    state.runMode.Running.connection.Connecting.address === destination.address;
}

export function isDisconnectingFrom(
  state: AppState,
  destination: Destination,
): boolean {
  return isDisconnecting(state) &&
    state.runMode.Running.connection.Disconnecting.address ===
      destination.address;
}

export function isPreparingSafe(
  state: AppState,
): state is AppState & { runMode: { PreparingSafe: PreparingSafe } } {
  const runMode: RunMode | null | undefined = state?.runMode;
  return !!runMode && typeof runMode === "object" && "PreparingSafe" in runMode;
}

export function isWarmup(
  state: AppState,
): state is AppState & { runMode: { Warmup: Warmup } } {
  const runMode: RunMode | null | undefined = state?.runMode;
  return !!runMode && typeof runMode === "object" && "Warmup" in runMode;
}

export function getVpnStatus(state: AppState): AppState["vpnStatus"] {
  if (!state || !state.runMode) return "ServiceUnavailable";
  if (isServiceUnavailable(state)) return "ServiceUnavailable";
  if (isConnected(state)) return "Connected";
  if (isConnecting(state)) return "Connecting";
  if (isDisconnecting(state)) return "Disconnecting";
  if (isDisconnected(state)) return "Disconnected";
  if (isPreparingSafe(state)) return "PreparingSafe";
  if (isWarmup(state)) return "Warmup";
  return "ServiceUnavailable";
}

function bigintStringGreaterThanZero(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const n = BigInt(value);
    return n > 0n;
  } catch {
    return false;
  }
}

export function isXDAITransferred(state: AppState): boolean {
  return (
    !!state &&
    isPreparingSafe(state) &&
    bigintStringGreaterThanZero(
      (state.runMode.PreparingSafe as unknown as { node_xdai: unknown })
        .node_xdai,
    )
  );
}

export function isWxHOPRTransferred(state: AppState): boolean {
  return (
    !!state &&
    isPreparingSafe(state) &&
    bigintStringGreaterThanZero(
      (state.runMode.PreparingSafe as unknown as { node_wxhopr: unknown })
        .node_wxhopr,
    )
  );
}
