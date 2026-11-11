/** Schematic globe for the live traffic pane: places come from opaque ids, not geography. */

/** Latitude and longitude in degrees. */
export type Geo = readonly [number, number];
/** Unit sphere (x towards 0°/0°, z north); after projection x right, y up, z towards the viewer. */
export type Vec3 = readonly [number, number, number];

export type EndpointKind = "relay" | "vpn" | "other";

/** What staging needs to know about a listed endpoint. */
export interface ListedEndpoint {
  id: string;
  kind: EndpointKind;
  /** Bytes per second both ways; busier endpoints are shown first. */
  rate: number;
}

export interface StagedEndpoint {
  kind: EndpointKind;
  rate: number;
  /** Seconds, same clock as `now`. */
  born: number;
  dying: number | null;
  /** Made room for a busier endpoint; fades out even while still listed. */
  evicted: boolean;
}

export interface Stage {
  shown: Map<string, StagedEndpoint>;
  nextReveal: number;
  nextRelay: number;
}

/** You, drawn where the design puts it; the app never learns the user's location. */
export const YOU: Geo = [47.4, 8.5];
/** Exits nearer than this (degrees) to You are drawn further away so the route stays readable. */
export const MIN_EXIT_ANGLE = 34;
export const MAX_SHOWN_ENDPOINTS = 20;
export const MAX_SHOWN_RELAYS = 17;
/** Seconds a departing endpoint takes to fade out. */
export const FADE_SECONDS = 1;
const RELAY_STEP = 0.55;
const FILL_STEP = { min: 0.35, max: 1.25 };
const CHURN_STEP = { min: 1.2, max: 2.6 };
const DEGREE = Math.PI / 180;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export function vec([lat, lon]: Geo): Vec3 {
  const a = lat * DEGREE;
  const b = lon * DEGREE;
  return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
}

export function geoOf([x, y, z]: Vec3): Geo {
  return [
    Math.asin(clamp(z, -1, 1)) / DEGREE,
    Math.atan2(y, x) / DEGREE,
  ];
}

/** Great-circle distance in degrees. */
export function angleBetween(a: Geo, b: Geo): number {
  const [ax, ay, az] = vec(a);
  const [bx, by, bz] = vec(b);
  return Math.acos(clamp(ax * bx + ay * by + az * bz, -1, 1)) / DEGREE;
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

/** A fraction in [0, 1) that is the same for an id every time. */
export function idFraction(id: string, salt: string): number {
  return fnv1a(`${id}:${salt}`) / 2 ** 32;
}

/** Relays spread over the hemisphere around You. */
export function relayGeo(id: string): Geo {
  return [
    idFraction(id, "lat") * 100 - 30,
    idFraction(id, "lon") * 140 - 40,
  ];
}

/** Endpoints scatter around where their traffic leaves: the exit for Via VPN, You otherwise. */
export function endpointGeo(id: string, [lat, lon]: Geo): Geo {
  return [
    clamp(lat + (idFraction(id, "lat") - 0.5) * 120, -60, 70),
    lon + (idFraction(id, "lon") - 0.5) * 150,
  ];
}

export function exitGeo(id: string): Geo {
  const spot: Geo = [
    idFraction(id, "lat") * 90 - 30,
    idFraction(id, "lon") * 210 - 80,
  ];
  return angleBetween(YOU, spot) >= MIN_EXIT_ANGLE
    ? spot
    : [YOU[0] - 16, YOU[1] + 42];
}

/** Between You and the exit, nudged north-east so both sit well inside the disc. */
export function cameraTarget(exit: Geo | null): Geo {
  const a = vec(YOU);
  const b = vec(exit ?? YOU);
  const sum: Vec3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const length = Math.hypot(...sum) || 1;
  const [lat, lon] = geoOf([sum[0] / length, sum[1] / length, sum[2] / length]);
  return [clamp(lat + 12, -10, 52), lon + 12];
}

/** Glides toward the target; longitude takes the short way round. */
export function easeCamera(current: Geo, target: Geo, seconds: number): Geo {
  const step = Math.min(1, seconds * 1.2);
  const lon = ((target[1] - current[1] + 540) % 360) - 180;
  return [
    current[0] + (target[0] - current[0]) * step,
    current[1] + lon * step,
  ];
}

/** Orthographic view centred on `center`. */
export function projector(center: Geo): (v: Vec3) => Vec3 {
  const lat = center[0] * DEGREE;
  const lon = center[1] * DEGREE;
  const [cosLat, sinLat] = [Math.cos(lat), Math.sin(lat)];
  const [cosLon, sinLon] = [Math.cos(-lon), Math.sin(-lon)];
  return ([x0, y0, z0]) => {
    const x1 = x0 * cosLon - y0 * sinLon;
    const y1 = x0 * sinLon + y0 * cosLon;
    return [y1, z0 * cosLat - x1 * sinLat, z0 * sinLat + x1 * cosLat];
  };
}

/** Great-circle arc lifted off the surface, drawn up to `grow` of its length. */
export function arcPoints(
  from: Geo,
  to: Geo,
  grow = 1,
  lift = 0.18,
  segments = 30,
): Vec3[] {
  const a = vec(from);
  const b = vec(to);
  const omega =
    Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) ||
    1e-6;
  const sinOmega = Math.sin(omega);
  const at = (f: number): Vec3 => {
    const s1 = Math.sin((1 - f) * omega) / sinOmega;
    const s2 = Math.sin(f * omega) / sinOmega;
    const height = 1 + lift * omega * Math.sin(Math.PI * f);
    return [
      (a[0] * s1 + b[0] * s2) * height,
      (a[1] * s1 + b[1] * s2) * height,
      (a[2] * s1 + b[2] * s2) * height,
    ];
  };
  const reach = clamp(grow, 0, 1);
  const whole = Math.floor(segments * reach);
  const points: Vec3[] = [];
  for (let n = 0; n <= whole; n++) points.push(at(n / segments));
  if (segments * reach - whole > 1e-3) points.push(at(reach));
  return points;
}

/** Meridians every 30° and parallels up to ±60°, decorative only. */
export function graticule(): Geo[][] {
  const lines: Geo[][] = [];
  for (let lon = -180; lon < 180; lon += 30) {
    lines.push(Array.from({ length: 37 }, (_, n) => [-90 + n * 5, lon]));
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    lines.push(Array.from({ length: 73 }, (_, n) => [lat, -180 + n * 5]));
  }
  return lines;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

export function createStage(): Stage {
  return { shown: new Map(), nextReveal: 0, nextRelay: 0 };
}

const between = (span: { min: number; max: number }, random: () => number) =>
  span.min + random() * (span.max - span.min);

/** One step of the build-up: reveals listed endpoints one at a time and retires the ones that left. */
export function stageEndpoints(
  stage: Stage,
  listed: readonly ListedEndpoint[],
  now: number,
  random: () => number = Math.random,
): void {
  const byId = new Map(listed.map((endpoint) => [endpoint.id, endpoint]));
  for (const [id, shown] of stage.shown) {
    const current = byId.get(id);
    if (current) {
      shown.kind = current.kind;
      shown.rate = current.rate;
    }
    // Back before its fade finished: keep the line instead of growing it again.
    if (current && !shown.evicted) {
      shown.dying = null;
    } else if (shown.dying === null) {
      shown.dying = now;
    } else if (now - shown.dying >= FADE_SECONDS) {
      stage.shown.delete(id);
    }
  }

  const waiting = listed
    .filter((endpoint) => !stage.shown.has(endpoint.id))
    .sort((a, b) => b.rate - a.rate);
  const reveal = (endpoint: ListedEndpoint) =>
    stage.shown.set(endpoint.id, {
      kind: endpoint.kind,
      rate: endpoint.rate,
      born: now,
      dying: null,
      evicted: false,
    });
  const alive = (relay: boolean) =>
    [...stage.shown.entries()].filter(([, shown]) =>
      shown.dying === null && (shown.kind === "relay") === relay
    );

  const relay = waiting.find((endpoint) => endpoint.kind === "relay");
  if (
    relay && now >= stage.nextRelay && alive(true).length < MAX_SHOWN_RELAYS
  ) {
    reveal(relay);
    stage.nextRelay = now + RELAY_STEP;
  }

  const other = waiting.find((endpoint) => endpoint.kind !== "relay");
  if (!other || now < stage.nextReveal) return;
  const shownOthers = alive(false);
  if (shownOthers.length < MAX_SHOWN_ENDPOINTS) {
    reveal(other);
    stage.nextReveal = now + between(FILL_STEP, random);
    return;
  }
  const [quietestId, quietest] = shownOthers.reduce((low, entry) =>
    entry[1].rate < low[1].rate ? entry : low
  );
  if (other.rate <= quietest.rate) return;
  const evicted = stage.shown.get(quietestId)!;
  evicted.evicted = true;
  evicted.dying = now;
  reveal(other);
  stage.nextReveal = now + between(CHURN_STEP, random);
}
