import type {
  Destination,
  DestinationState,
  Slots,
} from "@src/services/vpnService.ts";
import { getSortLatencyMs, isReadyToConnect } from "@src/utils/exitHealth.ts";

/** Sort by latency ascending; no-latency entries go last, then A–Z. */
export function sortByStartupLatency(
  available: Destination[],
  destinations: Record<string, DestinationState>,
): Destination[] {
  return [...available].sort((a, b) => {
    const msA = destinations[a.id]
      ? getSortLatencyMs(destinations[a.id])
      : null;
    const msB = destinations[b.id]
      ? getSortLatencyMs(destinations[b.id])
      : null;
    if (msA !== null && msB !== null) return msA - msB;
    if (msA !== null) return -1;
    if (msB !== null) return 1;
    return destinationLabel(a).localeCompare(destinationLabel(b));
  });
}

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

/** Sort: ReadyToConnect/Connecting first (latency ascending), all others after (A–Z). */
export function sortByHealthScore(
  available: Destination[],
  destinations: Record<string, DestinationState>,
): Destination[] {
  return [...available].sort((a, b) => {
    const aReady = isReadyToConnect(
      destinations[a.id]?.route_health ?? undefined,
    );
    const bReady = isReadyToConnect(
      destinations[b.id]?.route_health ?? undefined,
    );
    if (aReady !== bReady) return aReady ? -1 : 1;
    const msA = destinations[a.id]
      ? getSortLatencyMs(destinations[a.id])
      : null;
    const msB = destinations[b.id]
      ? getSortLatencyMs(destinations[b.id])
      : null;
    if (msA !== null && msB !== null) return msA - msB;
    if (msA !== null) return -1;
    if (msB !== null) return 1;
    return destinationLabel(a).localeCompare(destinationLabel(b));
  });
}

/** Sort: ReadyToConnect/Connecting first (A–Z within tier), all others after (A–Z). */
export function sortAlphaDestinations(
  available: Destination[],
  destinations: Record<string, DestinationState>,
): Destination[] {
  return [...available].sort((a, b) => {
    const aReady = isReadyToConnect(
      destinations[a.id]?.route_health ?? undefined,
    );
    const bReady = isReadyToConnect(
      destinations[b.id]?.route_health ?? undefined,
    );
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

/** Latency with a per-connected-client malus, for comparing destinations of unequal capacity. */
function capacityAdjustedLatencyMs(
  state: DestinationState,
  slots: Slots | null,
): number | null {
  const latencyMs = getSortLatencyMs(state);
  if (latencyMs === null) return null;
  return latencyMs +
    (slots?.connected ?? 0) * CONNECTED_CLIENT_LATENCY_MALUS_MS;
}

/** Capacity of a destination — `available` alone is free slots and drifts with load. */
function totalSlots(slots: Slots | null): number | null {
  return slots === null ? null : slots.available + slots.connected;
}

/** Sort ids: full destinations last, then by latency (malus-adjusted when capacity differs). */
export function sortByCapacityAwareLatency(
  destinations: Record<string, DestinationState>,
): string[] {
  return Object.keys(destinations).sort((idA, idB) => {
    const stateA = destinations[idA];
    const stateB = destinations[idB];
    const slotsA = getSlots(stateA);
    const slotsB = getSlots(stateB);

    const isFullA = slotsA !== null && slotsA.available <= 0;
    const isFullB = slotsB !== null && slotsB.available <= 0;
    if (isFullA !== isFullB) return isFullA ? 1 : -1;

    const sameCapacity = totalSlots(slotsA) === totalSlots(slotsB);
    const msA = sameCapacity
      ? getSortLatencyMs(stateA)
      : capacityAdjustedLatencyMs(stateA, slotsA);
    const msB = sameCapacity
      ? getSortLatencyMs(stateB)
      : capacityAdjustedLatencyMs(stateB, slotsB);
    if (msA !== null && msB !== null) return msA - msB;
    if (msA !== null) return -1;
    if (msB !== null) return 1;
    return destinationLabel(stateA.destination).localeCompare(
      destinationLabel(stateB.destination),
    );
  });
}

export function resolveAutoDestination(
  available: Destination[],
  destinations: Record<string, DestinationState>,
  preferredLocation: string | null,
): Destination | null {
  const candidates = sortByHealthScore(available, destinations);
  if (candidates.length === 0) return null;
  if (preferredLocation) {
    const preferred = candidates.find((d) => d.id === preferredLocation);
    if (
      preferred &&
      isReadyToConnect(
        destinations[preferredLocation]?.route_health ?? undefined,
      )
    ) {
      return preferred;
    }
  }
  return candidates[0] ?? null;
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

// Auto's label can land a whole status poll before the candidate that revokes it — the one title change DestinationCard holds, so that reversal can cancel it.
export function holdsTitleChange(next: string, isActiveCard: boolean): boolean {
  return isActiveCard && next === cardTitle("auto");
}
