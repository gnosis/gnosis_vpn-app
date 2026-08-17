// Reworked destination-mode data model — auto phase only for now.
// See [[backupDestinationMode.ts]] for the implementation being replaced.

import type {
  Destination,
  DestinationState,
} from "@src/services/vpnService.ts";
import { resolveAutoDestination } from "@src/utils/destinations.ts";

export type DestinationOrigin = "auto" | "user";

export interface Entry {
  id: string;
  origin: DestinationOrigin;
  // renderkey, continously incremented
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
  // Monotonic, never reused even across removals — see the render-key
  // discussion: deriving it from array position, or from `entries.size`,
  // would let a re-added id collide with (or inherit) a stale animation key.
  nextKey: number;
};

// The statusResponse-derived slice this module reacts to. Not assumed
// static — availableDestinations/destinations can change over the store's
// lifetime (a destination can appear, disappear, or change health), not
// just once at startup.
export type StatusSnapshot = {
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  preferredLocation: string | null;
};

/** Bootstrap only, for now: while `auto` and nothing is active yet, the
 * first ready candidate is picked immediately — no countdown, since there's
 * nothing yet to switch away from. */
export function applyStatusUpdate(
  mode: DestinationMode,
  status: StatusSnapshot,
): DestinationMode {
  if (mode.mode.phase !== "auto" || mode.active !== null) return mode;

  const candidate = resolveAutoDestination(
    status.availableDestinations,
    status.destinations,
    status.preferredLocation,
  );
  if (candidate === null) return mode;

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
  };
}
