import type { ModeAppState } from "./destinationMode.ts";
import { rankContext, sortByRouteQuality } from "@src/utils/destinations.ts";

/** A result younger than this is not redone; what makes the loop cycle instead of spin. */
export const QUICK_PROBE_FRESH_MS = 10_000;
/** Past the daemon's own 30 s budget: a lost result is abandoned by the clock. */
export const QUICK_PROBE_TIMEOUT_MS = 35_000;

export interface QuickProbeSchedule {
  inFlight: { id: string; issuedAt: number } | null;
}

export const IDLE_SCHEDULE: QuickProbeSchedule = { inFlight: null };

/** Runs on every status update while the list is open; `issue` is the quick probe to send, if any. */
export function nextQuickProbe(
  schedule: QuickProbeSchedule,
  status: ModeAppState,
  activeId: string | null,
  now: number,
): { schedule: QuickProbeSchedule; issue: string | null } {
  if (schedule.inFlight && !isDone(schedule.inFlight, status, now)) {
    return { schedule, issue: null };
  }
  const next = sortByRouteQuality(status.destinations, rankContext(status))
    .find((id) => id !== activeId && isCandidate(status, id, now));
  if (next === undefined) return { schedule: IDLE_SCHEDULE, issue: null };
  return { schedule: { inFlight: { id: next, issuedAt: now } }, issue: next };
}

/** The daemon's immediate reply: a refusal frees the slot, an acceptance waits for status. */
export function quickProbeAnswered(
  schedule: QuickProbeSchedule,
  id: string,
  accepted: boolean,
): QuickProbeSchedule {
  if (accepted || schedule.inFlight?.id !== id) return schedule;
  return IDLE_SCHEDULE;
}

function isDone(
  inFlight: { id: string; issuedAt: number },
  status: ModeAppState,
  now: number,
): boolean {
  if (now - inFlight.issuedAt >= QUICK_PROBE_TIMEOUT_MS) return true;
  const probe = status.destinations[inFlight.id]?.route_health?.quick_probe;
  if (!probe || probe.state === "Checking") return false;
  return probe.checked_at >= inFlight.issuedAt;
}

/** The daemon refuses unroutable exits and running checks; a fresh result is not worth redoing. */
function isCandidate(status: ModeAppState, id: string, now: number): boolean {
  const health = status.destinations[id]?.route_health;
  if (health?.state.state !== "Routable") return false;
  const probe = health.quick_probe;
  if (probe === null) return true;
  if (probe.state === "Checking") return false;
  return now - probe.checked_at >= QUICK_PROBE_FRESH_MS;
}
