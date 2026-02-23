import { createMemo, Show } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import type { DestinationState } from "../../services/vpnService.ts";
import {
  formatConnectionPhase,
  getConnectionLabel,
  getConnectionPhase,
} from "../../utils/status.ts";
import { destinationLabel } from "../../utils/destinations.ts";

/**
 * Derives a single-line connection status message from all destinations.
 *
 * Priority:
 *  1. Connecting  → "Connecting to {location}: {phase}"
 *  2. Connected   → "Connected to {location}"
 *  3. Disconnecting (only when nothing is connecting) → "Disconnecting from {location}: {phase}"
 */
function deriveStatus(
  destinations: Record<string, DestinationState>,
): string | undefined {
  let connectingDs: DestinationState | undefined;
  let connectedDs: DestinationState | undefined;
  let disconnectingDs: DestinationState | undefined;

  for (const ds of Object.values(destinations)) {
    const label = getConnectionLabel(ds.connection_state);
    if (label === "Connecting") connectingDs = ds;
    else if (label === "Connected") connectedDs = ds;
    else if (label === "Disconnecting") disconnectingDs = ds;
  }

  if (connectingDs) {
    const label = destinationLabel(connectingDs.destination);
    const rawPhase = getConnectionPhase(connectingDs.connection_state);
    if (rawPhase) {
      return formatConnectionPhase(rawPhase);
    }
    return `Connecting to ${label}`;
  }

  if (connectedDs) {
    const label = destinationLabel(connectedDs.destination);
    return `Connected to ${label}`;
  }

  if (disconnectingDs && !connectingDs) {
    const label = destinationLabel(disconnectingDs.destination);
    const rawPhase = getConnectionPhase(disconnectingDs.connection_state);
    if (rawPhase) {
      return formatConnectionPhase(rawPhase);
    }
    return `Disconnecting from ${label}`;
  }

  return undefined;
}

export default function ConnectionStatus() {
  const [appState] = useAppStore();

  const status = createMemo(() => {
    if (appState.vpnStatus === "ServiceUnavailable") return undefined;
    return deriveStatus(appState.destinations);
  });

  return (
    <Show when={status()}>
      {(s) => (
        <p class="w-full text-center text-xs text-text-secondary animate-fade-in select-none fixed bottom-1 text-ellipsis truncate px-2">
          {s()}
        </p>
      )}
    </Show>
  );
}
