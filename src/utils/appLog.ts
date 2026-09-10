import {
  formatWarmupStatus,
  isPreparingSafeRunMode,
  isWarmupRunMode,
  type StatusResponse,
  VPNService,
} from "@src/services/vpnService.ts";
import {
  destinationLabel,
  destinationLabelById,
} from "@src/utils/destinations.ts";
import { shortAddress } from "./shortAddress.ts";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Both windows derive the same status log lines from their own polling; only main persists those.
// try/catch: outside a Tauri webview (tests, shims) there is no window handle.
const isMainWindow = (() => {
  try {
    return getCurrentWindow().label === "main";
  } catch {
    return false;
  }
})();

// Leveled logger: mirrors to devtools and persists via the backend bridge (any window).
export function logInfo(message: string): void {
  console.info(message);
  VPNService.logToFile("info", message);
}

export function logWarn(message: string): void {
  console.warn(message);
  VPNService.logToFile("warn", message);
}

export function logError(message: string): void {
  console.error(message);
  VPNService.logToFile("error", message);
}

let lastMessage: string | undefined;

export function logMessage(message: string): void {
  if (!isMainWindow) return;
  if (lastMessage === message) return;
  lastMessage = message;
  VPNService.logToFile("info", message);
}

export function logStatus(response: StatusResponse): void {
  if (!isMainWindow) return;
  const content = buildLogContent(response, lastMessage);
  if (content) logMessage(content);
}

function buildLogContent(
  response: StatusResponse,
  lastMessage?: string,
): string | undefined {
  let content: string | undefined;
  const rm = response.run_mode;
  const dests = response.destinations;
  const { connected, connecting, reconnecting, disconnecting } = response;

  // Session transitions (connect/reconnect/disconnect) are logged by appStore's logStateChange.
  const inTransition = connected || connecting || reconnecting ||
    disconnecting.length > 0;
  if (inTransition) {
    return undefined;
  }

  if (typeof rm === "object" && "Running" in rm) {
    // Target kept with nothing in flight: parked reconnect, not idle.
    if (response.target_destination !== null) {
      const label = destinationLabelById(
        response.target_destination,
        dests.map((ds) => ds.destination),
      );
      return `Reconnecting: ${label} - waiting for route`;
    }
    // Running but no active connection
    const lastWasDisconnected = Boolean(
      lastMessage && lastMessage.startsWith("Disconnected"),
    );
    if (!lastWasDisconnected) {
      const lines = dests.map((ds) => {
        const d = ds.destination;
        const where = destinationLabel(d);
        return `- ${where} - ${shortAddress(d.address)}`;
      });
      content = `Disconnected. Available:\n${lines.join("\n")}`;
    }
  } else if (isPreparingSafeRunMode(rm)) {
    const addr = (rm as { PreparingSafe: { node_address: unknown } })
      .PreparingSafe.node_address;
    let isUnknown = false;
    if (typeof addr === "string") {
      const s = addr.trim().toLowerCase();
      isUnknown = s.length === 0 || s === "unknown";
    } else if (Array.isArray(addr)) {
      isUnknown = addr.length === 0;
    }
    if (isUnknown) {
      content = "Waiting for node address";
    }
  } else if (rm === "Shutdown") {
    content = "Shutdown";
  } else if (isWarmupRunMode(rm)) {
    content = `Warmup: ${formatWarmupStatus(rm.Warmup.status)}`;
  } else {
    const destinationCount = response.destinations.length;
    content = `status: Unknown (run_mode: ${
      JSON.stringify(rm)
    }), destinations: ${destinationCount}`;
  }
  return content;
}
