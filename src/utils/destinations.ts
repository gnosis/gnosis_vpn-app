import type {
  Destination,
  DestinationState,
  Slots,
} from "@src/services/vpnService.ts";
import { getSortLatencyMs } from "@src/utils/exitHealth.ts";

export function getPreferredAvailabilityChangeMessage(
  previous: Destination[],
  next: Destination[],
  preferredId: string | null,
): string | null {
  if (previous.length === 0) return null;
  if (!preferredId) return null;
  const previouslyHadPreferred = previous.some((d) => d.id === preferredId);
  const nowHasPreferred = next.some((d) => d.id === preferredId);
  if (previouslyHadPreferred === nowHasPreferred) return null;
  return nowHasPreferred
    ? `Preferred location ${preferredId} is available again.`
    : `Preferred location ${preferredId} currently unavailable.`;
}

/** Sort: ReadyToConnect/Connecting first (A–Z within tier), all others after (A–Z). */
export function sortAlphaDestinations(
  available: Destination[],
  destinations: Record<string, DestinationState>,
  liveId: string | null = null,
): Destination[] {
  return [...available].sort((a, b) => {
    const aReady = isReadyForDisplay(destinations[a.id], liveId);
    const bReady = isReadyForDisplay(destinations[b.id], liveId);
    if (aReady !== bReady) return aReady ? -1 : 1;
    return destinationLabel(a).localeCompare(destinationLabel(b));
  });
}

function getSlots(state: DestinationState): Slots | null {
  const routeState = state.route_health?.state;
  if (
    routeState?.state !== "ReadyToConnect" && routeState?.state !== "Connecting"
  ) {
    return null;
  }
  return routeState.exit.health.slots;
}

const CONNECTED_CLIENT_LATENCY_MALUS_MS = 100;

/** Latency plus a malus per connected client; our own connection doesn't count. */
function capacityAdjustedLatencyMs(
  state: DestinationState,
  slots: Slots | null,
  liveId: string | null,
): number | null {
  const latencyMs = getSortLatencyMs(state);
  if (latencyMs === null) return null;
  const occupiedByUs = state.destination.id === liveId ? 1 : 0;
  return latencyMs +
    Math.max(0, (slots?.connected ?? 0) - occupiedByUs) *
      CONNECTED_CLIENT_LATENCY_MALUS_MS;
}

/** Slots free for us — our own session must not count against the destination we are on. */
export function freeSlots(
  state: DestinationState,
  liveId: string | null,
): number | null {
  const slots = getSlots(state);
  if (slots === null) return null;
  return slots.available + (state.destination.id === liveId ? 1 : 0);
}

/** Connectable right now: a ready state and a slot to take. */
export function isReady(
  state: DestinationState | undefined,
  liveId: string | null,
): boolean {
  if (!state) return false;
  if (state.route_health?.state.state !== "ReadyToConnect") return false;
  return (freeSlots(state, liveId) ?? 0) > 0;
}

/** What the list may present as usable — the destination we are on always qualifies. */
export function isReadyForDisplay(
  state: DestinationState | undefined,
  liveId: string | null,
): boolean {
  if (!state) return false;
  return state.destination.id === liveId || isReady(state, liveId);
}

/** Ready non-full → ready full → not ready. Full nodes still beat unreachable ones. */
function capacityTier(state: DestinationState, liveId: string | null): number {
  const free = freeSlots(state, liveId);
  if (free === null) return 2;
  return free <= 0 ? 1 : 0;
}

/** Sort ids: ready non-full first, then ready-but-full, then the rest; ready tiers by malus-adjusted latency. */
export function sortByCapacityAwareLatency(
  destinations: Record<string, DestinationState>,
  liveId: string | null = null,
): string[] {
  return Object.keys(destinations).sort((idA, idB) => {
    const stateA = destinations[idA];
    const stateB = destinations[idB];

    const tierA = capacityTier(stateA, liveId);
    const tierB = capacityTier(stateB, liveId);
    if (tierA !== tierB) return tierA - tierB;

    const msA = capacityAdjustedLatencyMs(stateA, getSlots(stateA), liveId);
    const msB = capacityAdjustedLatencyMs(stateB, getSlots(stateB), liveId);
    if (msA !== null && msB !== null) return msA - msB;
    if (msA !== null) return -1;
    if (msB !== null) return 1;
    return destinationLabel(stateA.destination).localeCompare(
      destinationLabel(stateB.destination),
    );
  });
}

/** Connect-on-startup pick: where the last session left off, else the preferred location, else the best — each only while ready. */
export function pickStartupTarget(
  destinations: Record<string, DestinationState>,
  preferred: string | null,
  lastConnected: string | null = null,
): string | null {
  if (lastConnected !== null && isReady(destinations[lastConnected], null)) {
    return lastConnected;
  }
  if (preferred !== null && isReady(destinations[preferred], null)) {
    return preferred;
  }
  const readyIds = sortByCapacityAwareLatency(destinations)
    .filter((id) => isReady(destinations[id], null));
  return readyIds[0] ?? null;
}

/** Whether a VPN session is live enough that switching destinations should
 * retarget it via connect() rather than just re-pointing the display. Includes
 * Disconnecting only when it still has a target — a plain disconnect has none. */
export function isVpnActive(
  vpnStatus: string,
  targetDestination: string | null,
): boolean {
  return vpnStatus === "Connected" || vpnStatus === "Connecting" ||
    vpnStatus === "Reconnecting" ||
    (vpnStatus === "Disconnecting" && targetDestination !== null);
}

export function destinationLabel(d: Destination): string {
  const loc = d.meta?.location;
  return loc ? `${d.id} - ${loc}` : d.id;
}

export function destinationLabelById(
  id: string,
  available: Destination[],
): string {
  const dest = available.find((d) => d.id === id);
  return dest ? destinationLabel(dest) : `${id} (unavailable)`;
}

export type CardPhase = "auto" | "selected" | "connecting" | "uninitialized";

// "uninitialized" never actually reaches a rendered card — LocationBanner's
// entryIds() is empty until the mode resolves — but this stays exhaustive
// over the real union instead of a narrowed duplicate of it.
export function cardTitle(phase: CardPhase): string {
  switch (phase) {
    case "auto":
      return "Best Location";
    case "selected":
      return "Selected Location";
    case "connecting":
      return "Current Location";
    case "uninitialized":
      return "";
  }
}
