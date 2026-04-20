import { createMemo, Show } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import type { AppState } from "../../stores/appStore.ts";
import {
  formatConnectionPhase,
} from "../../utils/status.ts";
import { destinationLabel } from "../../utils/destinations.ts";

/**
 * Derives a single-line connection status message from the top-level state.
 *
 * Priority:
 *  1. Connecting  → "{phase}" or "Connecting to {location}"
 *  2. Connected   → "Connected to {location}"
 *  3. Disconnecting (only when nothing is connecting) → "{phase}" or "Disconnecting from {location}"
 */
function deriveStatus(appState: AppState): string | undefined {
  if (appState.connecting) {
    const dest =
      appState.destinations[appState.connecting.destination_id]?.destination;
    const label = dest
      ? destinationLabel(dest)
      : appState.connecting.destination_id;
    const phaseLabel = formatConnectionPhase(appState.connecting.phase);
    return phaseLabel !== appState.connecting.phase
      ? phaseLabel
      : `Connecting to ${label}`;
  }

  if (appState.connected) {
    const dest = appState.destinations[appState.connected]?.destination;
    const label = dest ? destinationLabel(dest) : appState.connected;
    return `Connected to ${label}`;
  }

  if (appState.disconnecting.length > 0) {
    const d = appState.disconnecting[0];
    const dest = appState.destinations[d.destination_id]?.destination;
    const label = dest ? destinationLabel(dest) : d.destination_id;
    const phaseLabel = formatConnectionPhase(d.phase);
    return phaseLabel !== d.phase
      ? phaseLabel
      : `Disconnecting from ${label}`;
  }

  return undefined;
}

export default function ConnectionStatus() {
  const [appState] = useAppStore();

  const status = createMemo(() => {
    if (appState.vpnStatus === "ServiceUnavailable") return undefined;
    return deriveStatus(appState);
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
