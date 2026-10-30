/** Unit sphere in view space (x right, y up, z to the viewer); dots sit on rings around the host, not on a map. */

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

/** What the globe needs to know about an endpoint besides its traffic. */
export interface GlobeEndpoint {
  id: string;
  hopr_peer: boolean;
  tunnel: boolean;
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
/** Next hops ring the host closely; tunnel destinations sit out by the rim as the far end of the path. */
export const WIRE_RADIUS = 0.42;
export const DESTINATION_RADIUS = 0.82;
/** How far an arc bends off its chord, relative to the chord length. */
const ARC_BEND = 0.18;
/** Arcs stay just inside the outline. */
const ARC_LIMIT = 0.98;
/** Time for a width change to cover about 63% of the distance to its target. */
const EASE_MS = 250;
/** Widths closer than this to their target snap to it. */
const SETTLE_WIDTH = 0.05;
/** Positions closer than this to their slot snap to it. */
const SETTLE_DISTANCE = 0.001;
/** Graticule tilt, so the northern cap shows like on a desk globe. */
const TILT = (20 * Math.PI) / 180;

export const HOME: Vec3 = onSphere(0, 0);
/** Right of the host, between the rings, so destinations fan out from it toward the rim. */
export const EXIT: Vec3 = onSphere(0.62, 0);
/** Relays leave this gap toward the exit so no relay sits on the tunnel line. */
const EXIT_GAP = Math.PI / 2;
/** Destinations fan out within this arc around the exit. */
const EXIT_FAN = Math.PI * 0.55;

export function onSphere(x: number, y: number): Vec3 {
  return { x, y, z: Math.sqrt(Math.max(0, 1 - x * x - y * y)) };
}

/** Even spacing over an arc; a lone id sits at its centre. */
export function ringSlots(
  ids: readonly string[],
  radius: number,
  centerAngle: number,
  spread: number,
): Map<string, Point> {
  const slots = new Map<string, Point>();
  ids.forEach((id, n) => {
    const angle = centerAngle + spread * ((n + 0.5) / ids.length - 0.5);
    slots.set(id, {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    });
  });
  return slots;
}

/** Relays first so they sit together; ids are per-session random keys, so the order holds for a session. */
export function layoutSlots(
  ids: Iterable<string>,
  hoprPeers: ReadonlySet<string>,
  destinations: ReadonlySet<string>,
  exitShown: boolean,
): Map<string, Point> {
  const wire: string[] = [];
  const tunnel: string[] = [];
  for (const id of ids) {
    if (destinations.has(id)) tunnel.push(id);
    else wire.push(id);
  }
  const relaysFirst = (a: string, b: string) => {
    const aIsRelay = hoprPeers.has(a);
    const bIsRelay = hoprPeers.has(b);
    if (aIsRelay !== bIsRelay) return aIsRelay ? -1 : 1;
    return a < b ? -1 : 1;
  };
  wire.sort(relaysFirst);
  tunnel.sort();
  const fullCircle = 2 * Math.PI;
  const exitAngle = Math.atan2(EXIT.y, EXIT.x);
  const wireSpread = exitShown ? fullCircle - EXIT_GAP : fullCircle;
  const tunnelSpread = exitShown ? EXIT_FAN : fullCircle;
  return new Map([
    ...ringSlots(wire, WIRE_RADIUS, exitAngle + Math.PI, wireSpread),
    ...ringSlots(tunnel, DESTINATION_RADIUS, exitAngle, tunnelSpread),
  ]);
}

/** New ids start on their slot, others slide so a joining dot doesn't make the ring jump; returns whether any still moves. */
export function easePositions(
  positions: Map<string, Point>,
  slots: ReadonlyMap<string, Point>,
  elapsedMs: number,
): boolean {
  const step = 1 - Math.exp(-Math.max(0, elapsedMs) / EASE_MS);
  let animating = false;
  for (const id of positions.keys()) {
    if (!slots.has(id)) positions.delete(id);
  }
  for (const [id, slot] of slots) {
    const position = positions.get(id);
    if (!position) {
      positions.set(id, { ...slot });
      continue;
    }
    position.x += (slot.x - position.x) * step;
    position.y += (slot.y - position.y) * step;
    const distance = Math.hypot(slot.x - position.x, slot.y - position.y);
    if (distance < SETTLE_DISTANCE) {
      position.x = slot.x;
      position.y = slot.y;
    } else {
      animating = true;
    }
  }
  return animating;
}

/** Bent left of its chord so every link curves the same way, like a flight path. */
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

/** Decorative only: endpoint positions do not follow the graticule. */
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

/** Logarithmic so trickles and bulk transfers both read, and fixed so a rate always draws the same width. */
export function linkWidth(bytesPerSecond: number): number {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return 0;
  const share = Math.log10(bytesPerSecond / LOW_RATE) /
    Math.log10(HIGH_RATE / LOW_RATE);
  const clamped = Math.min(1, Math.max(0, share));
  return MIN_LINK_WIDTH + (MAX_LINK_WIDTH - MIN_LINK_WIDTH) * clamped;
}

/** Links missing from `targets` shrink and are removed; returns whether any link still moves. */
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

/** Endpoints carrying `mark` in the frame, plus departed ones whose dot is still fading out. */
export function markedIds(
  endpoints: readonly GlobeEndpoint[],
  mark: "hopr_peer" | "tunnel",
  previous: ReadonlySet<string>,
  links: ReadonlyMap<string, Link>,
): Set<string> {
  const ids = new Set<string>();
  const listed = new Set<string>();
  for (const endpoint of endpoints) {
    listed.add(endpoint.id);
    if (endpoint[mark]) ids.add(endpoint.id);
  }
  for (const id of previous) {
    if (!listed.has(id) && links.has(id)) ids.add(id);
  }
  return ids;
}
