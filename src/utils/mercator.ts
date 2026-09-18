/// Web Mercator helpers for the main-screen map.
///
/// The map carries no projection library: `scripts/generate-map.py` pre-projects the country
/// outlines into `src/assets/map/`, and everything the runtime still needs is the same formula
/// applied to a single point, plus an SVG viewBox to frame it.

/// The projected world is MAP_SIZE x MAP_SIZE. Keep in step with scripts/generate-map.py.
export const MAP_SIZE = 1000;

/// Web Mercator's usual cutoff - the poles project to infinity.
const MAX_LAT = 85.05;

/// [minX, minY, maxX, maxY] in Mercator units.
export type Bbox = readonly [number, number, number, number];
export type Point = readonly [number, number];

/// A viewport measured in CSS pixels.
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/// Longitude/latitude in degrees to Mercator units. Mirrors project() in the generator.
export function project(lon: number, lat: number): Point {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const x = ((lon + 180) / 360) * MAP_SIZE;
  const y = (1 -
    Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) / Math.PI) /
    2;
  return [x, y * MAP_SIZE];
}

export function pointToBbox(point: Point): Bbox {
  return [point[0], point[1], point[0], point[1]];
}

/// Zoomed in far enough that a country fills the frame, but never so far that a single point
/// leaves nothing recognizable around it.
const MIN_SPAN = 24;

export interface Framing {
  /// [x, y, width, height] in Mercator units - the same view as `viewBox`, before rounding,
  /// so a transition has numbers to interpolate.
  readonly box: Bbox;
  /// Ready for the SVG viewBox attribute.
  readonly viewBox: string;
  /// Mercator units per CSS pixel. Multiply radii and stroke widths by this so they keep a
  /// constant on-screen size however far the view is zoomed in.
  readonly scale: number;
}

/// Frames everything in `boxes`, matching the viewport's shape so nothing is letterboxed.
///
/// `padding` is a fraction of the framed span, so 0.3 leaves a 30% margin.
export function fitViewBox(
  boxes: readonly Bbox[],
  viewport: Viewport,
  padding: number,
): Framing {
  const aspect = viewport.width > 0 && viewport.height > 0
    ? viewport.width / viewport.height
    : 1;

  // With nothing to frame, show as much of the world as the viewport's shape allows. Growing
  // to fit here would push the view past the projection and band the sides with empty space,
  // so this one case crops the poles instead.
  if (boxes.length === 0) {
    const width = Math.min(MAP_SIZE, MAP_SIZE * aspect);
    return framing(
      (MAP_SIZE - width) / 2,
      (MAP_SIZE - width / aspect) / 2,
      width,
      width / aspect,
      viewport,
    );
  }

  let [minX, minY, maxX, maxY] = boxes[0];
  for (const [x0, y0, x1, y1] of boxes) {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  // A lone point has no extent of its own, and two points in one city nearly none.
  let width = Math.max(maxX - minX, MIN_SPAN) * (1 + padding);
  let height = Math.max(maxY - minY, MIN_SPAN) * (1 + padding);

  // Grow the axis that is proportionally too small; shrinking one would crop the content.
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  return framing(
    clampToWorld(centreX - width / 2, width),
    clampToWorld(centreY - height / 2, height),
    width,
    height,
    viewport,
  );
}

/// Drifting past the edges of the projection would band the view with empty space beside the
/// world, so pull it back inside — unless it is wider than the world and cannot fit, in which
/// case centre it.
function clampToWorld(value: number, span: number): number {
  return span >= MAP_SIZE
    ? (MAP_SIZE - span) / 2
    : Math.max(0, Math.min(MAP_SIZE - span, value));
}

function framing(
  left: number,
  top: number,
  width: number,
  height: number,
  viewport: Viewport,
): Framing {
  return {
    box: [left, top, width, height],
    viewBox: formatViewBox([left, top, width, height]),
    // Both axes carry the same factor once the frame matches the viewport's shape.
    scale: viewport.width > 0 ? width / viewport.width : 1,
  };
}

export function formatViewBox(box: Bbox): string {
  return box.map(round).join(" ");
}

/// Eases one framing towards another, for `t` in 0..1.
///
/// Width moves geometrically rather than linearly: a zoom covering a 10x range spends almost
/// all of a linear tween at the wide end and then snaps, whereas multiplying by a constant
/// ratio each step reads as a steady rate throughout. The centre moves linearly, which is
/// what the eye expects of a pan.
export function lerpFraming(
  from: Framing,
  to: Framing,
  t: number,
  viewport: Viewport,
): Framing {
  const [fx, fy, fw, fh] = from.box;
  const [tx, ty, tw, th] = to.box;
  const width = fw * (tw / fw) ** t;
  const height = fh * (th / fh) ** t;
  // Interpolate the centres, not the corners: corners drift the view sideways when the two
  // framings differ in size.
  const centreX = (fx + fw / 2) + ((tx + tw / 2) - (fx + fw / 2)) * t;
  const centreY = (fy + fh / 2) + ((ty + th / 2) - (fy + fh / 2)) * t;
  // Both endpoints are already inside the world, but a frame part-way between them need not
  // be: the centre moves linearly while the width shrinks geometrically, so a wide frame can
  // still be sitting over a corner mid-transition.
  return framing(
    clampToWorld(centreX - width / 2, width),
    clampToWorld(centreY - height / 2, height),
    width,
    height,
    viewport,
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
