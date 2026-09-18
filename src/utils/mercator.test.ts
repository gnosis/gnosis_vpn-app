import { describe, expect, it } from "vitest";
import {
  type Bbox,
  fitViewBox,
  formatViewBox,
  lerpFraming,
  MAP_SIZE,
  pointToBbox,
  project,
} from "./mercator.ts";

const VIEWPORT = { width: 328, height: 132 };

describe("project", () => {
  it("puts the origin at the centre of the world", () => {
    const [x, y] = project(0, 0);
    expect(x).toBeCloseTo(MAP_SIZE / 2, 6);
    expect(y).toBeCloseTo(MAP_SIZE / 2, 6);
  });

  it("maps the antimeridian to the edges", () => {
    expect(project(-180, 0)[0]).toBeCloseTo(0, 6);
    expect(project(180, 0)[0]).toBeCloseTo(MAP_SIZE, 6);
  });

  it("puts north above south", () => {
    expect(project(0, 50)[1]).toBeLessThan(project(0, -50)[1]);
  });

  // The generator applies the identical clamp, so a pole must not project to infinity here
  // either - an unclamped value would poison the viewBox and blank the whole map.
  it("clamps the poles to a finite value", () => {
    for (const lat of [90, -90, 1e6]) {
      const [, y] = project(0, lat);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  // Vienna, as configured for the Austria destination.
  it("agrees with the generator on a known city", () => {
    const [x, y] = project(16.3647, 48.202);
    expect(x).toBeCloseTo(545.46, 1);
    expect(y).toBeCloseTo(346.77, 1);
  });
});

describe("fitViewBox", () => {
  const parse = (viewBox: string) => viewBox.split(" ").map(Number);

  // A wide, short strip cannot show every latitude as well, so the poles are cropped rather
  // than the sides being banded with empty space beyond the projection.
  it("frames the full width of the world when there is nothing to show", () => {
    const [x, y, width, height] = parse(fitViewBox([], VIEWPORT, 0.3).viewBox);
    expect(width).toBe(MAP_SIZE);
    expect(x).toBe(0);
    expect(height).toBeLessThan(MAP_SIZE);
    expect(y + height / 2).toBeCloseTo(MAP_SIZE / 2, 1);
  });

  it("matches the viewport's aspect so nothing is letterboxed", () => {
    const [, , width, height] = parse(
      fitViewBox([[400, 300, 440, 340]], VIEWPORT, 0.3).viewBox,
    );
    expect(width / height).toBeCloseTo(VIEWPORT.width / VIEWPORT.height, 3);
  });

  it("covers every box it is given", () => {
    const boxes: Bbox[] = [[400, 300, 420, 320], [600, 380, 610, 390]];
    const [x, y, width, height] = parse(
      fitViewBox(boxes, VIEWPORT, 0.3).viewBox,
    );
    for (const [x0, y0, x1, y1] of boxes) {
      expect(x).toBeLessThanOrEqual(x0);
      expect(y).toBeLessThanOrEqual(y0);
      expect(x + width).toBeGreaterThanOrEqual(x1);
      expect(y + height).toBeGreaterThanOrEqual(y1);
    }
  });

  // Two markers in the same city collapse the union to a point; without a floor the view
  // would zoom to zero span and divide by ~0.
  it("keeps a usable span for a single point", () => {
    const [, , width, height] = parse(
      fitViewBox([pointToBbox([500, 500])], VIEWPORT, 0.3).viewBox,
    );
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(Number.isFinite(width)).toBe(true);
  });

  it("never scrolls past the edge of the projection", () => {
    for (const box of [[0, 0, 5, 5], [995, 995, 1000, 1000]] as Bbox[]) {
      const [x, y, width, height] = parse(
        fitViewBox([box], VIEWPORT, 0.3).viewBox,
      );
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(MAP_SIZE + 0.01);
      expect(y + height).toBeLessThanOrEqual(MAP_SIZE + 0.01);
    }
  });

  // Markers are drawn in Mercator units but must look the same size on screen at any zoom.
  it("reports Mercator units per pixel", () => {
    const framing = fitViewBox([[400, 300, 440, 340]], VIEWPORT, 0.3);
    const [, , width] = parse(framing.viewBox);
    expect(framing.scale).toBeCloseTo(width / VIEWPORT.width, 4);
  });

  it("zooms in further for a small country than a large one", () => {
    const small = fitViewBox([[500, 400, 510, 410]], VIEWPORT, 0.3);
    const large = fitViewBox([[200, 200, 600, 600]], VIEWPORT, 0.3);
    expect(small.scale).toBeLessThan(large.scale);
  });

  it("survives a viewport that has not been measured yet", () => {
    const framing = fitViewBox(
      [[400, 300, 440, 340]],
      { width: 0, height: 0 },
      0.3,
    );
    expect(framing.viewBox.split(" ").every((v) => Number.isFinite(Number(v))))
      .toBe(true);
    expect(Number.isFinite(framing.scale)).toBe(true);
  });
});

describe("lerpFraming", () => {
  const from = fitViewBox([[500, 400, 520, 420]], VIEWPORT, 0.3);
  const to = fitViewBox([[200, 200, 600, 600]], VIEWPORT, 0.3);

  it("returns the endpoints at t = 0 and t = 1", () => {
    expect(lerpFraming(from, to, 0, VIEWPORT).box).toEqual(from.box);
    expect(lerpFraming(from, to, 1, VIEWPORT).box).toEqual(to.box);
  });

  // A linear width lerp spends almost all of a wide-range zoom at the far end and then
  // snaps; multiplying by a constant ratio each step reads as a steady rate instead.
  it("takes the geometric mean of the widths at the midpoint, not the arithmetic one", () => {
    const mid = lerpFraming(from, to, 0.5, VIEWPORT);
    const geometric = Math.sqrt(from.box[2] * to.box[2]);
    const arithmetic = (from.box[2] + to.box[2]) / 2;
    expect(mid.box[2]).toBeCloseTo(geometric, 4);
    expect(mid.box[2]).toBeLessThan(arithmetic);
  });

  it("moves the centre, not the corner", () => {
    const centre = (f: typeof from) => f.box[0] + f.box[2] / 2;
    const mid = lerpFraming(from, to, 0.5, VIEWPORT);
    expect(centre(mid)).toBeCloseTo((centre(from) + centre(to)) / 2, 4);
  });

  // Markers are sized by scale; taking it from the target rather than the current frame
  // makes them visibly breathe for the length of the transition.
  it("keeps scale in step with the interpolated width", () => {
    const mid = lerpFraming(from, to, 0.5, VIEWPORT);
    expect(mid.scale).toBeCloseTo(mid.box[2] / VIEWPORT.width, 6);
  });

  it("holds the viewport's aspect throughout", () => {
    for (const t of [0.1, 0.25, 0.5, 0.9]) {
      const { box } = lerpFraming(from, to, t, VIEWPORT);
      expect(box[2] / box[3]).toBeCloseTo(VIEWPORT.width / VIEWPORT.height, 4);
    }
  });

  it("stays inside the projection at every step", () => {
    // Both ends fit inside the world, so every frame between them must too — panning from a
    // corner while zooming could otherwise slide the view off the edge mid-transition.
    const corner = fitViewBox([[0, 0, 10, 10]], VIEWPORT, 0.3);
    const inland = fitViewBox([[200, 200, 500, 500]], VIEWPORT, 0.3);
    for (let t = 0; t <= 1; t += 0.05) {
      const [x, y, w, h] = lerpFraming(corner, inland, t, VIEWPORT).box;
      expect(x).toBeGreaterThanOrEqual(-0.01);
      expect(y).toBeGreaterThanOrEqual(-0.01);
      expect(x + w).toBeLessThanOrEqual(MAP_SIZE + 0.01);
      expect(y + h).toBeLessThanOrEqual(MAP_SIZE + 0.01);
    }
  });

  // A short wide viewport can want a frame wider than the world itself; there is nowhere to
  // pull it back to, so it centres instead and the map sits in the middle.
  it("centres a frame too wide for the world", () => {
    const [x, , w] = to.box;
    expect(w).toBeGreaterThan(MAP_SIZE);
    expect(x + w / 2).toBeCloseTo(MAP_SIZE / 2, 6);
  });
});

describe("formatViewBox", () => {
  it("rounds to two decimals", () => {
    expect(formatViewBox([1.234567, 2.5, 3, 4.005])).toBe("1.23 2.5 3 4.01");
  });

  it("matches the string fitViewBox already produces", () => {
    const framing = fitViewBox([[400, 300, 440, 340]], VIEWPORT, 0.3);
    expect(formatViewBox(framing.box)).toBe(framing.viewBox);
  });
});
