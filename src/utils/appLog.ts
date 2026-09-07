import {
  formatWarmupStatus,
  isPreparingSafeRunMode,
  isWarmupRunMode,
  type StatusResponse,
  VPNService,
} from "@src/services/vpnService.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import { shortAddress } from "./shortAddress.ts";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Both windows derive the same log lines from their own polling; only main persists.
const isMainWindow = getCurrentWindow().label === "main";

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
  // Build a keyed map for ID-based lookups
  const destMap = Object.fromEntries(
    dests.map((ds) => [ds.destination.id, ds]),
  );

  if (connected) {
    const dest = destMap[connected.destination_id]?.destination;
    const where = dest ? destinationLabel(dest) : connected.destination_id;
    const addr = dest ? shortAddress(dest.address) : "";
    const connDisplay = addr ? `${where} - ${addr}` : where;
    content = `Connected: ${connDisplay}`;
  } else if (reconnecting) {
    const dest = destMap[reconnecting.destination_id]?.destination;
    const where = dest ? destinationLabel(dest) : reconnecting.destination_id;
    const addr = dest ? shortAddress(dest.address) : "";
    const connDisplay = addr ? `${where} - ${addr}` : where;
    content = `Reconnecting: ${connDisplay} - ${reconnecting.phase}`;
  } else if (connecting) {
    const dest = destMap[connecting.destination_id]?.destination;
    const where = dest ? destinationLabel(dest) : connecting.destination_id;
    const addr = dest ? shortAddress(dest.address) : "";
    const connDisplay = addr ? `${where} - ${addr}` : where;
    content = `Connecting: ${connDisplay} - ${connecting.phase}`;
  } else if (disconnecting.length > 0) {
    const d = disconnecting[0];
    const dest = destMap[d.destination_id]?.destination;
    const where = dest ? destinationLabel(dest) : d.destination_id;
    const addr = dest ? shortAddress(dest.address) : "";
    const connDisplay = addr ? `${where} - ${addr}` : where;
    content = `Disconnecting: ${connDisplay} - ${d.phase}`;
  } else if (typeof rm === "object" && "Running" in rm) {
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
    content = `status: Unknown, destinations: ${destinationCount}`;
  }
  return content;
}
