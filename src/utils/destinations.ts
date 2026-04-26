import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import { getSortLatencyMs, isReadyToConnect } from "@src/utils/exitHealth.ts";

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

/**
 * List to pass to {@link selectTargetId}: preserves `available` order when the user
 * chose a specific exit; otherwise health-sorted (same ordering as connect’s auto path).
 */
export function destinationsForTargetSelection(
  explicitExitId: string | null | undefined,
  available: Destination[],
  destinations: Record<string, DestinationState>,
): Destination[] {
  if (explicitExitId) return available;
  return sortByHealthScore(available, destinations);
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

export function selectTargetId(
  id: string | undefined,
  preferredId: string | null,
  available: Destination[],
): { id: string | undefined; reason: string } {
  if (id) return { id, reason: "id parameter set" };
  if (preferredId) {
    const hasPreferred = available.some((d) => d.id === preferredId);
    if (hasPreferred) {
      return { id: preferredId, reason: "preferred location" };
    }
    return {
      id: available[0]?.id,
      reason: "fallback: preferred not present",
    };
  }
  return {
    id: available[0]?.id,
    reason: "fallback: no preferred set",
  };
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
