import {
  type Connection,
  connectionDestination,
  type Destination,
  type DestinationState,
  type ExitVersions,
  type LoadAvg,
  type Mode,
  type ProbeView,
  type QuickProbeCheck,
  type QuickProbeState,
  type SetModeResponse,
  type Slots,
} from "@src/services/vpnService.ts";

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

/** Sort: eligible first, all others after; each A–Z by the name the list shows, then by full label. */
export function sortAlphaDestinations(
  available: Destination[],
  destinations: Record<string, DestinationState>,
  context: RankContext,
): Destination[] {
  return [...available].sort((a, b) => {
    const aReady = isReadyForDisplay(destinations[a.id], context);
    const bReady = isReadyForDisplay(destinations[b.id], context);
    if (aReady !== bReady) return aReady ? -1 : 1;
    return compareByName(a, b);
  });
}

/** A–Z by the name the list shows, then by full label. */
function compareByName(a: Destination, b: Destination): number {
  return exitDisplayName(a).localeCompare(exitDisplayName(b)) ||
    destinationLabel(a).localeCompare(destinationLabel(b));
}

/** What readiness and ranking need beyond the destination itself. */
export interface RankContext {
  probe: ProbeView | null;
  liveId: string | null;
}

export const NO_CONTEXT: RankContext = { probe: null, liveId: null };

export function rankContext(status: {
  probe: ProbeView | null;
  connection: Connection;
}): RankContext {
  return {
    probe: status.probe,
    liveId: connectionDestination(status.connection),
  };
}

/** What was measured on the exit itself, by the live probe or a quick probe. */
export interface ExitData {
  slots: Slots;
  loadAvg: LoadAvg;
  rtt: number;
  checkedAt: number;
  versions: ExitVersions;
  apiVersion: string | null;
}

/** A running check keeps what it refreshes, so a re-check never blanks an exit; `checked_at` still ages. */
function lastQuickCheck(quick: QuickProbeState | null): QuickProbeCheck | null {
  if (quick === null) return null;
  if (quick.type === "checked") return quick;
  return quick.type === "checking" ? quick.last : null;
}

/** The probe refreshes continuously, so it wins over a quick probe's snapshot where it applies. */
export function getExitData(
  state: DestinationState,
  probe: ProbeView | null,
): ExitData | null {
  // A reopening probe still carries the closed session's samples - they are no longer current.
  const probeIsLive = probe?.destination === state.destination.id &&
    probe.state === "ready";
  if (
    probeIsLive && probe.load && probe.ping_rtt !== null &&
    probe.checked_at !== null && probe.versions
  ) {
    return {
      slots: probe.load.slots,
      loadAvg: probe.load.load_avg,
      rtt: probe.ping_rtt,
      checkedAt: probe.checked_at,
      versions: probe.versions,
      apiVersion: probe.api_version,
    };
  }
  const check = lastQuickCheck(state.route_health?.quick_probe ?? null);
  if (check === null) return null;
  return {
    slots: check.load.slots,
    loadAvg: check.load.load_avg,
    rtt: check.status_rtt,
    checkedAt: check.checked_at,
    versions: check.versions,
    apiVersion: check.api_version,
  };
}

/** Slots free for us — our own session must not count against the destination we are on. */
export function freeSlots(
  state: DestinationState,
  context: RankContext,
): number | null {
  const exit = getExitData(state, context.probe);
  if (exit === null) return null;
  const occupiedByUs = state.destination.id === context.liveId ? 1 : 0;
  return exit.slots.available + occupiedByUs;
}

/** Not full once the exit has been measured; unmeasured passes on the route alone. */
function hasFreeSlot(state: DestinationState, context: RankContext): boolean {
  const free = freeSlots(state, context);
  return free === null || free > 0;
}

/** What the user may pick: the daemon connects to any Routable destination, but a full exit can only fail. */
export function isSelectable(
  state: DestinationState | undefined,
  context: RankContext,
): boolean {
  if (state?.route_health?.state.type !== "routable") return false;
  return hasFreeSlot(state, context);
}

/** Connectable right now: selectable, and the daemon has graded its path. */
export function isReady(
  state: DestinationState | undefined,
  context: RankContext,
): boolean {
  const isGraded = (state?.route_health?.percent_of_best ?? null) !== null;
  return isGraded && isSelectable(state, context);
}

/** What the list may present as usable — the destination we are on always qualifies. */
export function isReadyForDisplay(
  state: DestinationState | undefined,
  context: RankContext,
): boolean {
  if (!state) return false;
  return state.destination.id === context.liveId || isReady(state, context);
}

export type RouteGrade =
  | { kind: "graded"; bars: 1 | 2 | 3 | 4; percentOfBest: number }
  | { kind: "unmeasured" }
  | { kind: "none" };

/** Cuts just above the path planner's latency factors (0.7, 0.3, 0.15): one more slow hop drops one bar. */
function barsFor(percentOfBest: number): 1 | 2 | 3 | 4 {
  if (percentOfBest >= 90) return 4;
  if (percentOfBest >= 60) return 3;
  if (percentOfBest >= 25) return 2;
  return 1;
}

/** Bars relative to the best exit, so the top exit always has four. */
export function routeGrade(
  state: DestinationState | undefined,
  context: RankContext,
): RouteGrade {
  if (!state || !isSelectable(state, context)) return { kind: "none" };
  const percentOfBest = state.route_health?.percent_of_best ?? null;
  if (percentOfBest === null) return { kind: "unmeasured" };
  return { kind: "graded", bars: barsFor(percentOfBest), percentOfBest };
}

/** Lower is better: most bars first, then unmeasured, ungraded last. */
export function gradeRank(
  state: DestinationState | undefined,
  context: RankContext,
): number {
  const grade = routeGrade(state, context);
  switch (grade.kind) {
    case "graded":
      return 4 - grade.bars;
    case "unmeasured":
      return 4;
    case "none":
      return 5;
  }
}

/** The one order for the Quality tab, auto, startup and quick probes: by grade, A–Z within a grade. */
export function sortByGrade(
  destinations: Record<string, DestinationState>,
  context: RankContext,
): Destination[] {
  return Object.values(destinations)
    .map((state) => ({
      destination: state.destination,
      rank: gradeRank(state, context),
    }))
    .sort((a, b) =>
      a.rank - b.rank || compareByName(a.destination, b.destination)
    )
    .map(({ destination }) => destination);
}

/** Text for an exit that shows no grade bars; bars alone speak for a graded one. */
export function routeGradeLabel(grade: RouteGrade): string {
  return grade.kind === "unmeasured" ? "Not measured yet" : "";
}

/** The exit list's name for an exit: a configured exit's id, else its country, else its title. */
export function exitDisplayName(d: Destination): string {
  return d.names.display_name;
}

/** The country, when the exit's name is not already it. */
export function exitSecondaryCountry(d: Destination): string | null {
  const country = d.names.country;
  return country === d.names.display_name ? null : country;
}

/** Tells apart exits that share a country. */
export function exitShortId(d: Destination): string {
  return d.names.short_id;
}

/** The list's rows: usable exits and `current`, all matching `query`; the first `limit` unless searching. */
export function pickerRows(
  sorted: Destination[],
  options: {
    query: string;
    // the tunnel's exit is listed whether usable or not
    current: Destination | null;
    // pinned, `current` leads outside the limit; else it keeps its sorted place, if the limit reaches it
    pinCurrent: boolean;
    isUsable: (id: string) => boolean;
    limit: number | null;
  },
): Destination[] {
  const q = options.query.trim().toLowerCase();
  const matches = (d: Destination) =>
    destinationSearchText(d).toLowerCase().includes(q);
  const currentId = options.current?.id;
  const listed = sorted.filter((d) =>
    d.id === currentId ? !options.pinCurrent : options.isUsable(d.id)
  );
  const shown = q
    ? listed.filter(matches)
    : options.limit === null
    ? listed
    : listed.slice(0, options.limit);
  const current = options.current;
  if (!options.pinCurrent || !current || (q && !matches(current))) {
    return shown;
  }
  return [current, ...shown];
}

/**
 * What a mode request leaves behind: the mode to reconnect in, and whether to save the setting,
 * which only follows a mode the service runs. `response` is null when the request failed. A switch while an earlier switch still waits
 * to reconnect keeps reconnecting, since that earlier switch is what ended the session.
 */
export function modeRequestOutcome(
  mode: Mode,
  response: SetModeResponse | null,
  sessionUp: boolean,
  pending: Mode | null,
): { reconnect: Mode | null; saveSetting: boolean } {
  if (response === "switching") {
    return {
      reconnect: sessionUp || pending !== null ? mode : null,
      saveSetting: true,
    };
  }
  return { reconnect: pending, saveSetting: response === "unchanged" };
}

/**
 * After a mode switch ended a session: the Auto pick, once the status shows the requested mode
 * and one of its exits is ready. The last session and the preferred exit belong to the old mode.
 */
export function modeSwitchReconnectTarget(
  pending: Mode | null,
  statusMode: Mode,
  destinations: Record<string, DestinationState>,
  context: RankContext,
): string | null {
  if (pending === null || pending !== statusMode) return null;
  return pickStartupTarget(destinations, null, null, context);
}

/** Connect-on-startup pick: where the last session left off, else the preferred location, else the best — each only while ready. */
export function pickStartupTarget(
  destinations: Record<string, DestinationState>,
  preferred: string | null,
  mostRecent: string | null,
  context: RankContext,
): string | null {
  if (mostRecent !== null && isReady(destinations[mostRecent], context)) {
    return mostRecent;
  }
  if (preferred !== null && isReady(destinations[preferred], context)) {
    return preferred;
  }
  const best = sortByGrade(destinations, context)
    .find((d) => isReady(destinations[d.id], context));
  return best?.id ?? null;
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

/** The connect id and published name, as the exit's source combines them. */
export function destinationTitle(d: Destination): string {
  return d.names.title;
}

/** The exit's country as the client derived it; never the operator's claim. */
export function destinationCountry(d: Destination): string | null {
  return d.names.country;
}

/** Sanitized by the backend, like every published label. */
export function destinationDescription(d: Destination): string | null {
  return d.names.description;
}

export function destinationLabel(d: Destination): string {
  const title = destinationTitle(d);
  const country = destinationCountry(d);
  return country ? `${title} - ${country}` : title;
}

/** Label, description and the row's #short id, so a search tells apart exits that share a country. */
export function destinationSearchText(d: Destination): string {
  const description = destinationDescription(d);
  return [destinationLabel(d), description, `#${exitShortId(d)}`]
    .filter((part) => part)
    .join(" ");
}

/** Every value is config's: nothing was discovered for this destination. */
export function isConfigOnly(d: Destination): boolean {
  return d.source === "configured";
}

export function destinationLabelById(
  id: string,
  available: Destination[],
): string {
  const dest = available.find((d) => d.id === id);
  return dest ? destinationLabel(dest) : `${id} (unavailable)`;
}

export type CardPhase = "auto" | "selected" | "connecting" | "uninitialized";

// "uninitialized" never reaches the card — it renders only once a destination is active —
// but this stays exhaustive over the real union instead of a narrowed duplicate of it.
export function cardTitle(phase: CardPhase): string {
  switch (phase) {
    case "auto":
      return "Current Best Location";
    case "selected":
      return "Selected Location";
    case "connecting":
      return "Current Location";
    case "uninitialized":
      return "";
  }
}
