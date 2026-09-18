import { REGIONS } from "@assets/map/regions.ts";
import type { Point } from "./mercator.ts";

/// One bowed leg of a route, as a quadratic Bezier.
export interface Leg {
  readonly from: Point;
  readonly control: Point;
  readonly to: Point;
}

export interface Route {
  readonly legs: readonly Leg[];
  /// The intermediate points only — endpoints are the caller's `home` and `exit`.
  readonly waypoints: readonly Point[];
}

/// How far a leg bows off the straight line, as a fraction of its length.
const BOW = 0.18;
/// More than the mixnet allows (hopr-lib caps intermediate hops at 3), so a nonsense hop
/// count cannot spray markers across the map.
const MAX_WAYPOINTS = 3;
/// Mercator units. Two points closer than this frame as one marker, so a waypoint that lands
/// on top of an endpoint is no waypoint at all.
const MIN_SEPARATION = 12;
/// How far past the endpoints to look for hops, as a fraction of the distance between them.
/// Roughly matches the margin the map leaves around the route, so the countries on offer are
/// the ones actually on screen.
const SEARCH_PAD = 0.45;
/// Mercator units, and the reason neighbouring countries still get a choice of hops: without
/// a floor, two exits a few degrees apart would search a sliver of map containing nothing.
/// Picking a hop from further out pulls the view open to fit it, which is what makes the
/// surrounding countries visible.
const MIN_SEARCH_HALF_SPAN = 42;

/// FNV-1a. Not for security — only to turn a connection's identity into a stable index.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/// Countries whose marker sits in the stretch of map the route is drawn across.
///
/// Bounded rather than global: the framing has to cover every point drawn, so a hop picked
/// from anywhere in the world would zoom the map out until the user's own country was a few
/// pixels wide. The box is the span between the endpoints, widened by `SEARCH_PAD` to about
/// what the map shows around them, and never narrower than `MIN_SEARCH_HALF_SPAN`.
function candidatesBetween(
  home: Point,
  exit: Point,
  avoid: readonly Point[],
): Point[] {
  const centreX = (home[0] + exit[0]) / 2;
  const centreY = (home[1] + exit[1]) / 2;
  const halfX = Math.max(
    (Math.abs(exit[0] - home[0]) / 2) * (1 + SEARCH_PAD),
    MIN_SEARCH_HALF_SPAN,
  );
  const halfY = Math.max(
    (Math.abs(exit[1] - home[1]) / 2) * (1 + SEARCH_PAD),
    MIN_SEARCH_HALF_SPAN,
  );
  const minX = centreX - halfX;
  const maxX = centreX + halfX;
  const minY = centreY - halfY;
  const maxY = centreY + halfY;

  const found: Point[] = [];
  for (const region of Object.values(REGIONS)) {
    const point = region.point;
    if (point[0] < minX || point[0] > maxX) continue;
    if (point[1] < minY || point[1] > maxY) continue;
    if (distance(point, home) < MIN_SEPARATION) continue;
    if (distance(point, exit) < MIN_SEPARATION) continue;
    // Keeps the return path off the forward path's hops, so the two read as separate routes
    // rather than one line drawn twice.
    if (avoid.some((used) => distance(point, used) < MIN_SEPARATION)) continue;
    found.push(point);
  }
  // Object key order is insertion order, so this is stable across runs — the seed alone
  // decides which candidate is taken.
  return found;
}

function bow(from: Point, to: Point, direction: number): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const midX = (from[0] + to[0]) / 2;
  const midY = (from[1] + to[1]) / 2;
  if (length === 0) return [midX, midY];
  // Perpendicular offset. `direction` alternates per leg so consecutive legs bow opposite
  // ways; bowing them the same way stacks into an S that reads as one wobbly line.
  return [
    midX + (-dy / length) * length * BOW * direction,
    midY + (dx / length) * length * BOW * direction,
  ];
}

/// Builds the path traffic takes, as the map draws it.
///
/// `waypointCount` is the route's real hop count. Their **positions are not real** — the
/// daemon reports how many relays a session uses but never which, so each waypoint is a
/// country picked deterministically from `seed`. The map styles them as anonymous, and the
/// accessible label never names them; see the plan's note on honesty.
///
/// `seed` must be stable for the life of a connection (the status poll re-runs every couple
/// of seconds), so pass something like `${destinationId}:${connectedSince}`.
export function buildRoute(
  home: Point,
  exit: Point,
  waypointCount: number,
  seed: string,
  avoid: readonly Point[] = [],
): Route {
  const wanted = Math.max(
    0,
    Math.min(MAX_WAYPOINTS, Math.floor(waypointCount)),
  );
  const pool = wanted > 0 ? candidatesBetween(home, exit, avoid) : [];

  const waypoints: Point[] = [];
  for (let i = 0; i < wanted; i++) {
    if (pool.length === 0) {
      // Neighbouring countries leave no room for a third country between them. Falling back
      // to points along the straight line keeps the leg count honest rather than silently
      // drawing a direct connection for a multi-hop route.
      const at = (i + 1) / (wanted + 1);
      waypoints.push([
        home[0] + (exit[0] - home[0]) * at,
        home[1] + (exit[1] - home[1]) * at,
      ]);
      continue;
    }
    // A second index derived from the same seed, so two waypoints do not collide.
    const index = hash(`${seed}#${i}`) % pool.length;
    waypoints.push(pool.splice(index, 1)[0]);
  }

  const stops: Point[] = [home, ...waypoints, exit];
  const legs: Leg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    legs.push({
      from: stops[i],
      control: bow(stops[i], stops[i + 1], i % 2 === 0 ? 1 : -1),
      to: stops[i + 1],
    });
  }

  return { legs, waypoints };
}

/// The forward and return halves of a connection.
///
/// Traffic does not retrace its steps through a mixnet — the return path is planned
/// separately and goes through its own relays — so the two get different hops. Their
/// positions are invented either way; only the count is real.
export interface RoutePair {
  readonly forward: Route;
  readonly back: Route;
}

export function buildRoutePair(
  home: Point,
  exit: Point,
  waypointCount: number,
  seed: string,
): RoutePair {
  const forward = buildRoute(home, exit, waypointCount, `${seed}:forward`);
  // Built reversed, so its sweep runs exit to home and its own bow maths curves it clear of
  // the forward line instead of tracing back over it.
  const back = buildRoute(
    exit,
    home,
    waypointCount,
    `${seed}:back`,
    forward.waypoints,
  );
  return { forward, back };
}

/// A point along a leg, for `t` in 0..1.
export function pointOnLeg(leg: Leg, t: number): Point {
  const inv = 1 - t;
  const a = inv * inv;
  const b = 2 * inv * t;
  const c = t * t;
  return [
    a * leg.from[0] + b * leg.control[0] + c * leg.to[0],
    a * leg.from[1] + b * leg.control[1] + c * leg.to[1],
  ];
}

/// The whole route as one continuous path, for a sweep that runs source to exit.
///
/// Consecutive legs share an endpoint, so they chain into a single subpath — repeating `Q`
/// after the initial `M` rather than starting a new `M` per leg, which would break the stroke
/// into pieces and make a dash sweep restart at every waypoint.
export function routePath(route: Route): string {
  return chainedPath([route]);
}

/// Several routes as one continuous path, for a sweep that runs through all of them in turn.
///
/// The forward route ends at the exit and the return route starts there, so the pair chains
/// into a single unbroken subpath — out through one set of hops and back through another.
/// That matters because SVG restarts a dash pattern at every `M`: as separate subpaths the
/// two would sweep at the same time instead of one after the other.
export function chainedPath(routes: readonly Route[]): string {
  const legs = routes.flatMap((route) => route.legs);
  if (legs.length === 0) return "";
  const head = `M${legs[0].from[0]},${legs[0].from[1]}`;
  const rest = legs
    .map((leg) =>
      ` Q${leg.control[0]},${leg.control[1]} ${leg.to[0]},${leg.to[1]}`
    )
    .join("");
  return head + rest;
}

export function legPath(leg: Leg): string {
  return `M${leg.from[0]},${leg.from[1]} Q${leg.control[0]},${leg.control[1]} ${
    leg.to[0]
  },${leg.to[1]}`;
}

/// Maps progress along the whole route onto a leg.
///
/// Weighted by each leg's straight-line length, so a dot crosses a short leg quickly and a
/// long one slowly instead of spending equal time on each regardless of distance.
export function pointOnRoute(
  route: Route,
  progress: number,
): Point | undefined {
  const { legs } = route;
  if (legs.length === 0) return undefined;
  const lengths = legs.map((leg) => distance(leg.from, leg.to));
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (total === 0) return legs[0].from;

  let remaining = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < legs.length; i++) {
    if (remaining <= lengths[i] || i === legs.length - 1) {
      return pointOnLeg(legs[i], lengths[i] === 0 ? 0 : remaining / lengths[i]);
    }
    remaining -= lengths[i];
  }
  return legs[legs.length - 1].to;
}
