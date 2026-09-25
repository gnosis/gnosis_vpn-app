import type {
  Destination,
  DestinationState,
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

/** Sort: eligible first (A–Z within tier), all others after (A–Z). */
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

/** Relative order of ineligible destinations; an ineligible Paths walk keeps its own best_value. */
const NO_PATH_VALUE = 0;
const UNKNOWN_VALUE = -1;
const UNRECOVERABLE_VALUE = -2;

/** How close a destination is to eligible: its best path's value, or a rank below any path. */
function routeValue(state: DestinationState): number {
  const health = state.route_health;
  if (!health) return UNKNOWN_VALUE;
  if (health.state.state === "Unrecoverable") return UNRECOVERABLE_VALUE;
  const walk = health.walk;
  if (walk === null) return UNKNOWN_VALUE;
  return walk.found === "Paths" ? walk.best_value : NO_PATH_VALUE;
}

/** Connectable right now: the walk found a full-value path and nothing latched the route. */
export function isReady(state: DestinationState | undefined): boolean {
  if (!state?.route_health) return false;
  const { state: routeState, walk } = state.route_health;
  if (routeState.state !== "Routable") return false;
  return walk?.found === "Paths" && walk.best_value >= 1;
}

/** What the list may present as usable — the destination we are on always qualifies. */
export function isReadyForDisplay(
  state: DestinationState | undefined,
  liveId: string | null,
): boolean {
  if (!state) return false;
  return state.destination.id === liveId || isReady(state);
}

/** Sort ids: eligible first by distinct first relays, then the rest by how close they are to eligible. */
export function sortByRouteQuality(
  destinations: Record<string, DestinationState>,
): string[] {
  return Object.keys(destinations).sort((idA, idB) => {
    const stateA = destinations[idA];
    const stateB = destinations[idB];

    const readyA = isReady(stateA);
    const readyB = isReady(stateB);
    if (readyA !== readyB) return readyA ? -1 : 1;

    if (readyA && readyB) {
      const pathsA = pathStats(stateA);
      const pathsB = pathStats(stateB);
      if (pathsA.relays !== pathsB.relays) return pathsB.relays - pathsA.relays;
      if (pathsA.count !== pathsB.count) return pathsB.count - pathsA.count;
    } else {
      const valueA = routeValue(stateA);
      const valueB = routeValue(stateB);
      if (valueA !== valueB) return valueB - valueA;
    }
    return destinationLabel(stateA.destination).localeCompare(
      destinationLabel(stateB.destination),
    );
  });
}

/** Resilience of the best path: more distinct first relays means fewer single points of failure. */
function pathStats(state: DestinationState): { relays: number; count: number } {
  const walk = state.route_health?.walk;
  if (walk?.found !== "Paths") return { relays: 0, count: 0 };
  return { relays: walk.distinct_first_relays, count: walk.count };
}

/** Connect-on-startup pick: where the last session left off, else the preferred location, else the best — each only while ready. */
export function pickStartupTarget(
  destinations: Record<string, DestinationState>,
  preferred: string | null,
  lastConnected: string | null = null,
): string | null {
  if (lastConnected !== null && isReady(destinations[lastConnected])) {
    return lastConnected;
  }
  if (preferred !== null && isReady(destinations[preferred])) {
    return preferred;
  }
  const readyIds = sortByRouteQuality(destinations)
    .filter((id) => isReady(destinations[id]));
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

// Longest label value rendered before it is elided; mirrors the client's META_FIELD_MAX_CHARS.
const META_FIELD_MAX_CHARS = 64;

// Controls plus the zero-width and bidi-override formatting characters that could spoof surrounding text.
const DISPLAY_UNSAFE =
  /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

/** Metadata is operator-published and unverified, so never render it verbatim. */
export function sanitizeMetaText(text: string): string {
  const cleaned = Array.from(text.replace(DISPLAY_UNSAFE, ""));
  if (cleaned.length <= META_FIELD_MAX_CHARS) return cleaned.join("");
  return cleaned.slice(0, META_FIELD_MAX_CHARS).join("") + "\u2026";
}

/** The published `name`; a name that respells the connect id says nothing new, unless config pinned it and the override should show. */
export function destinationName(d: Destination): string | null {
  if (d.meta.name === null) return null;
  const name = sanitizeMetaText(d.meta.name);
  if (name === "") return null;
  const respellsId = name === d.id && !isConfigPinned(d, "name");
  return respellsId ? null : name;
}

/** A discovered id is the name slugged, so the name alone suffices; a configured id is the user's own handle and leads. */
export function destinationTitle(d: Destination): string {
  const name = destinationName(d);
  if (d.source === "Discovered") return name ?? d.id;
  return name === null ? d.id : `${d.id} (${name})`;
}

export function destinationLocation(d: Destination): string | null {
  return d.meta.location === null ? null : sanitizeMetaText(d.meta.location);
}

export function destinationDescription(d: Destination): string | null {
  return d.meta.description === null
    ? null
    : sanitizeMetaText(d.meta.description);
}

export function destinationLabel(d: Destination): string {
  const title = destinationTitle(d);
  const loc = destinationLocation(d);
  return loc ? `${title} - ${loc}` : title;
}

/** Label plus description, so the list's search reaches operator blurbs too. */
export function destinationSearchText(d: Destination): string {
  const label = destinationLabel(d);
  const description = destinationDescription(d);
  return description ? `${label} ${description}` : label;
}

export type PinnableMeta = "name" | "location" | "flag" | "description";

/** Configuration set this value; only meaningful where config and discovery mix, as on a config-only entry every value is config's. */
export function isConfigPinned(d: Destination, key: PinnableMeta): boolean {
  const mixedOrigins = d.source === "ConfiguredAndDiscovered";
  return mixedOrigins && key in d.overrides.configured_meta;
}

/** Every value is config's: nothing was discovered for this destination. */
export function isConfigOnly(d: Destination): boolean {
  return d.source === "Configured";
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
