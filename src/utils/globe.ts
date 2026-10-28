/**
 * Geometry for the stylized traffic globe.
 *
 * Positions live in view space on the unit sphere: x to the right, y up and z
 * toward the viewer, so the visible hemisphere is z > 0 and a point projects
 * orthographically onto the unit disc as (x, y). Endpoint positions are derived
 * from opaque ids and carry no geographic meaning.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A projected point on the unit disc, y up. */
export interface Point {
  x: number;
  y: number;
}

/** Line width easing toward the width the current traffic asks for. */
export interface Link {
  width: number;
  target: number;
}

export const MIN_LINK_WIDTH = 1;
export const MAX_LINK_WIDTH = 12;

/** Rates at or below this draw the thinnest line. */
const LOW_RATE = 100;
/** Rates at or above this draw the thickest line. */
const HIGH_RATE = 10_000_000;
/** Endpoints stay inside this radius so no dot sits on the outline. */
const PLACEMENT_RADIUS = 0.86;
/** How far an arc bends off its chord, relative to the chord length. */
const ARC_BEND = 0.18;
/** Arcs stay just inside the outline. */
const ARC_LIMIT = 0.98;
/** Time for a width change to cover about 63% of the distance to its target. */
const EASE_MS = 250;
/** Widths closer than this to their target snap to it. */
const SETTLE_WIDTH = 0.05;
/** Graticule tilt, so the northern cap shows like on a desk globe. */
const TILT = (20 * Math.PI) / 180;

/** Where the local host sits: lower left, like a viewer's own position on a map. */
export const HOME: Vec3 = onSphere(-0.48, -0.36);

function onSphere(x: number, y: number): Vec3 {
  return { x, y, z: Math.sqrt(Math.max(0, 1 - x * x - y * y)) };
}

/** 32-bit FNV-1a, enough to scatter ids evenly. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let n = 0; n < text.length; n++) {
    hash ^= text.charCodeAt(n);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Places an endpoint id on the visible hemisphere, the same spot every time. */
export function endpointPosition(id: string): Vec3 {
  const u = fnv1a(id) / 2 ** 32;
  const v = fnv1a(`${id}:angle`) / 2 ** 32;
  // The square root spreads dots evenly over the disc area.
  const radius = PLACEMENT_RADIUS * Math.sqrt(u);
  const angle = 2 * Math.PI * v;
  return onSphere(radius * Math.cos(angle), radius * Math.sin(angle));
}

/**
 * Samples the great-circle arc between two visible points, bent to the left of
 * its chord so every link curves the same way, like a flight path. Both ends lie
 * on the visible hemisphere, so the whole arc does too.
 */
export function arcPoints(from: Vec3, to: Vec3, segments = 32): Point[] {
  const dot = Math.min(
    1,
    Math.max(-1, from.x * to.x + from.y * to.y + from.z * to.z),
  );
  const angle = Math.acos(dot);
  const sinAngle = Math.sin(angle);
  // Left-hand normal of the projected chord; its length is the chord length.
  const normal = { x: -(to.y - from.y), y: to.x - from.x };
  const points: Point[] = [];
  for (let n = 0; n <= segments; n++) {
    const t = n / segments;
    // Spherical interpolation; nearly identical points fall back to a straight line.
    const a = sinAngle < 1e-6 ? 1 - t : Math.sin((1 - t) * angle) / sinAngle;
    const b = sinAngle < 1e-6 ? t : Math.sin(t * angle) / sinAngle;
    const bend = ARC_BEND * Math.sin(Math.PI * t);
    const x = a * from.x + b * to.x + normal.x * bend;
    const y = a * from.y + b * to.y + normal.y * bend;
    const distance = Math.hypot(x, y);
    const limit = distance > ARC_LIMIT ? ARC_LIMIT / distance : 1;
    points.push({ x: x * limit, y: y * limit });
  }
  return points;
}

function tilted(latitude: number, longitude: number): Vec3 {
  const x = Math.cos(latitude) * Math.sin(longitude);
  const y = Math.sin(latitude);
  const z = Math.cos(latitude) * Math.cos(longitude);
  return {
    x,
    y: y * Math.cos(TILT) - z * Math.sin(TILT),
    z: y * Math.sin(TILT) + z * Math.cos(TILT),
  };
}

/**
 * Parallels and meridians of a tilted globe, as visible polylines on the unit
 * disc. Purely decorative: endpoint positions do not follow them.
 */
export function graticule(): Point[][] {
  const lines: Point[][] = [];
  const degree = Math.PI / 180;
  const trace = (sample: (step: number) => Vec3, steps: number) => {
    let line: Point[] = [];
    for (let step = 0; step <= steps; step++) {
      const point = sample(step);
      if (point.z >= 0) {
        line.push({ x: point.x, y: point.y });
      } else if (line.length > 0) {
        if (line.length > 1) lines.push(line);
        line = [];
      }
    }
    if (line.length > 1) lines.push(line);
  };
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    trace((step) => tilted(latitude * degree, (step * 2 - 180) * degree), 180);
  }
  for (let longitude = -180; longitude < 180; longitude += 30) {
    trace((step) => tilted((step - 90) * degree, longitude * degree), 180);
  }
  return lines;
}

/**
 * Line width for an endpoint's average rate. Logarithmic, so both a background
 * trickle and a bulk transfer stay readable, and fixed, so the same rate always
 * draws the same width.
 */
export function linkWidth(bytesPerSecond: number): number {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return 0;
  const share = Math.log10(bytesPerSecond / LOW_RATE) /
    Math.log10(HIGH_RATE / LOW_RATE);
  const clamped = Math.min(1, Math.max(0, share));
  return MIN_LINK_WIDTH + (MAX_LINK_WIDTH - MIN_LINK_WIDTH) * clamped;
}

/**
 * Moves every link's width toward its target. Links missing from `targets`
 * shrink to nothing and are then removed. Returns whether any link is still
 * moving.
 */
export function easeLinks(
  links: Map<string, Link>,
  targets: ReadonlyMap<string, number>,
  elapsedMs: number,
): boolean {
  for (const [id, target] of targets) {
    const link = links.get(id);
    if (link) link.target = target;
    else links.set(id, { width: 0, target });
  }
  const step = 1 - Math.exp(-Math.max(0, elapsedMs) / EASE_MS);
  let animating = false;
  for (const [id, link] of links) {
    if (!targets.has(id)) link.target = 0;
    link.width += (link.target - link.width) * step;
    if (Math.abs(link.target - link.width) < SETTLE_WIDTH) {
      link.width = link.target;
    } else {
      animating = true;
    }
    if (link.target === 0 && link.width === 0) links.delete(id);
  }
  return animating;
}
