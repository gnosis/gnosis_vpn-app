import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import type { AppState } from "../../stores/appStore.ts";
import {
  formatConnectionPhase,
  formatStall,
  waitingForRouteMessage,
} from "../../utils/status.ts";
import { destinationLabel } from "../../utils/destinations.ts";

/**
 * Derives a single-line connection status message from the top-level state.
 *
 * Priority:
 *  1. Reconnecting → "{phase}", or "Waiting for route to {location}" with none in flight
 *  2. Connecting   → "{phase}" or "Connecting to {location}"
 *  3. Connected    → "Connected to {location}", plus " · stalled 18 s (2/3)" while the tunnel stalls
 *  4. Disconnecting (only when nothing is connecting) → "{phase}" or "Disconnecting from {location}"
 */
function deriveStatus(
  appState: AppState,
  nowMs: number,
): string | undefined {
  const connection = appState.connection;
  const labelOf = (id: string): string => {
    const dest = appState.destinations[id]?.destination;
    return dest ? destinationLabel(dest) : id;
  };

  const reconnecting = connection.type === "reconnecting" ? connection : null;
  // No phase: either a phase-less reconnect (waiting on route health) or only a parked target.
  const reconnectingId = reconnecting?.destination ??
    (appState.vpnStatus === "Reconnecting" ? appState.targetDestination : null);
  if (reconnectingId !== null) {
    if (!reconnecting?.phase) {
      return waitingForRouteMessage(appState, reconnectingId);
    }
    const phaseLabel = formatConnectionPhase(reconnecting.phase);
    return phaseLabel !== reconnecting.phase
      ? phaseLabel
      : `Reconnecting to ${labelOf(reconnectingId)}`;
  }

  if (connection.type === "connecting") {
    const phaseLabel = formatConnectionPhase(connection.phase);
    return phaseLabel !== connection.phase
      ? phaseLabel
      : `Connecting to ${labelOf(connection.destination)}`;
  }

  if (connection.type === "connected") {
    const label = labelOf(connection.destination);
    const stall = connection.stall;
    return stall
      ? `Connected to ${label} · ${formatStall(stall, nowMs)}`
      : `Connected to ${label}`;
  }

  if (appState.disconnecting.length > 0) {
    const d = appState.disconnecting[0];
    const label = labelOf(d.destination);
    const phaseLabel = formatConnectionPhase(d.phase);
    return phaseLabel !== d.phase ? phaseLabel : `Disconnecting from ${label}`;
  }

  return undefined;
}

export default function ConnectionStatus() {
  const [appState] = useAppStore();

  // Store updates with an unchanged stall never re-run the memo, so the elapsed time needs its own clock.
  const [nowMs, setNowMs] = createSignal(Date.now());
  const tick = setInterval(() => setNowMs(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));

  const status = createMemo(() => {
    if (appState.vpnStatus === "ServiceUnavailable") return undefined;
    return deriveStatus(appState, nowMs());
  });

  return (
    <Show when={status()}>
      {(s) => (
        <p class="w-full text-center text-xs text-text-secondary transition-opacity duration-300 ease-out starting:opacity-0 fixed bottom-1 left-0 text-ellipsis truncate px-2">
          {s()}
        </p>
      )}
    </Show>
  );
}
