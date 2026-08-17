// Reworked destination-mode model (auto phase only) — see
// [[backupDestinationMode.ts]] for what this replaces.

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import { sortByHealthScore } from "@src/utils/destinations.ts";
import { isReadyToConnect } from "@src/utils/exitHealth.ts";

export type DestinationOrigin = "auto" | "user";

export interface Entry {
  id: string;
  origin: DestinationOrigin;
  key: number;
}

export interface AutoPending {
  candidateId: string;
  countdownEndsAt: number;
  settleAt: number;
}

export type Mode =
  | { phase: "auto"; pending: AutoPending | null }
  | { phase: "selected"; autoRevertAt: number }
  | { phase: "connecting" };

export type DestinationMode = {
  entries: Map<string, Entry>;
  sequence: string[];
  active: string | null;
  mode: Mode;
  // Monotonic, never reused — deriving it from array position or
  // `entries.size` would let a re-added id collide with a stale render key.
  nextKey: number;
  // From the settings store, not statusResponse — fixed at creation time,
  // never touched by applyStatusUpdate.
  preferredLocation: string | null;
};

// availableDestinations/destinations can change over the store's lifetime
// now, not just once at startup.
export type StatusSnapshot = {
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
};

// Stub — currently mirrors utils/destinations.ts's resolveAutoDestination;
// will be reworked once the new model's candidate rules are settled.
function resolveCandidate(
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

/** Stub: nothing active yet, auto phase, no entries — `preferredLocation` is
 * captured once here since the settings store won't feed it in again. */
export function createDestinationMode(
  preferredLocation: string | null,
): DestinationMode {
  return {
    entries: new Map(),
    sequence: [],
    active: null,
    mode: { phase: "auto", pending: null },
    nextKey: 0,
    preferredLocation,
  };
}

export function applyStatusUpdate(
  mode: DestinationMode,
  status: StatusSnapshot,
): DestinationMode {
  // first

  const candidate = resolveCandidate(
    status.availableDestinations,
    status.destinations,
    mode.preferredLocation,
  );
  if (candidate === null) return mode;
  // resolveAutoDestination falls back to the first available destination
  // even when none are ready — bootstrap must wait for a real one instead.
  const candidateReady = isReadyToConnect(
    status.destinations[candidate.id]?.route_health ?? undefined,
  );
  if (!candidateReady) return mode;

  const freshEntry: Entry = {
    id: candidate.id,
    origin: "auto",
    key: mode.nextKey,
  };
  return {
    entries: new Map([[candidate.id, freshEntry]]),
    sequence: [candidate.id],
    active: candidate.id,
    mode: { phase: "auto", pending: null },
    nextKey: mode.nextKey + 1,
    preferredLocation: mode.preferredLocation,
  };
}
