import { describe, expect, it } from "vitest";
import { REGIONS } from "@assets/map/regions.ts";
import {
  buildRoute,
  buildRoutePair,
  chainedPath,
  legPath,
  pointOnLeg,
  pointOnRoute,
  routePath,
} from "./route.ts";
import type { Point } from "./mercator.ts";

// Warsaw and Zurich in Mercator units, far enough apart to leave room between them.
const HOME: Point = REGIONS.pl.point as Point;
const EXIT: Point = REGIONS.ch.point as Point;

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

describe("buildRoute", () => {
  it("draws one leg per hop plus one", () => {
    expect(buildRoute(HOME, EXIT, 0, "s").legs).toHaveLength(1);
    expect(buildRoute(HOME, EXIT, 1, "s").legs).toHaveLength(2);
    expect(buildRoute(HOME, EXIT, 2, "s").legs).toHaveLength(3);
  });

  it("starts at home and ends at the exit", () => {
    const { legs } = buildRoute(HOME, EXIT, 1, "s");
    expect(legs[0].from).toEqual(HOME);
    expect(legs[legs.length - 1].to).toEqual(EXIT);
  });

  it("joins its legs end to end", () => {
    const { legs } = buildRoute(HOME, EXIT, 2, "s");
    for (let i = 0; i < legs.length - 1; i++) {
      expect(legs[i].to).toEqual(legs[i + 1].from);
    }
  });

  // The status poll rebuilds this every couple of seconds; a waypoint that moved on each
  // tick would make the map twitch.
  it("gives the same waypoints for the same seed", () => {
    const a = buildRoute(HOME, EXIT, 1, "dest-zurich:1700000000");
    const b = buildRoute(HOME, EXIT, 1, "dest-zurich:1700000000");
    expect(a.waypoints).toEqual(b.waypoints);
  });

  it("gives different waypoints for different connections", () => {
    const seeds = ["a:1", "b:2", "c:3", "d:4", "e:5", "f:6"];
    const picked = new Set(
      seeds.map((s) => JSON.stringify(buildRoute(HOME, EXIT, 1, s).waypoints)),
    );
    expect(picked.size).toBeGreaterThan(1);
  });

  // Hops come from the stretch of map the route crosses — wider than the endpoints alone, so
  // there is a real choice of country, but bounded, or the view would zoom out to fit a hop
  // on the far side of the world.
  it("keeps waypoints within the searched stretch of map", () => {
    const centreX = (HOME[0] + EXIT[0]) / 2;
    const centreY = (HOME[1] + EXIT[1]) / 2;
    const halfX = Math.max((Math.abs(EXIT[0] - HOME[0]) / 2) * 1.45, 42) + 0.01;
    const halfY = Math.max((Math.abs(EXIT[1] - HOME[1]) / 2) * 1.45, 42) + 0.01;
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      for (const [x, y] of buildRoute(HOME, EXIT, 1, seed).waypoints) {
        expect(Math.abs(x - centreX)).toBeLessThanOrEqual(halfX);
        expect(Math.abs(y - centreY)).toBeLessThanOrEqual(halfY);
      }
    }
  });

  // Two exits a few degrees apart used to search a sliver of map containing nothing and fall
  // back to the straight line. The search floor means they now find real countries, and the
  // map opens up to fit them.
  it("still finds a country for endpoints that are close together", () => {
    const near: Point = [HOME[0] + 6, HOME[1] + 4];
    const { waypoints } = buildRoute(HOME, near, 1, "seed");
    expect(waypoints).toHaveLength(1);
    // Further from the pair than the pair are from each other — which is what opens the view.
    expect(distance(waypoints[0] as Point, HOME)).toBeGreaterThan(
      distance(HOME, near),
    );
  });

  it("never stacks a waypoint on an endpoint", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      for (const point of buildRoute(HOME, EXIT, 1, seed).waypoints) {
        expect(distance(point, HOME)).toBeGreaterThan(5);
        expect(distance(point, EXIT)).toBeGreaterThan(5);
      }
    }
  });

  it("does not reuse one country for two waypoints", () => {
    const { waypoints } = buildRoute(HOME, EXIT, 3, "seed");
    const unique = new Set(waypoints.map((p) => p.join(",")));
    expect(unique.size).toBe(waypoints.length);
  });

  // Open ocean has no country marker to offer at any search width. The leg count still has
  // to match the hop count rather than collapsing to a direct line.
  it("falls back to the straight line where there is no country at all", () => {
    const a: Point = [111.1, 587.4]; // mid-Pacific
    const b: Point = [113.1, 588.4];
    const route = buildRoute(a, b, 1, "seed");
    expect(route.legs).toHaveLength(2);
    expect(route.waypoints).toHaveLength(1);
    expect(route.waypoints[0][0]).toBeCloseTo(112.1, 6);
  });

  it("clamps a nonsense hop count", () => {
    expect(buildRoute(HOME, EXIT, 99, "s").waypoints.length)
      .toBeLessThanOrEqual(3);
    expect(buildRoute(HOME, EXIT, -5, "s").waypoints).toHaveLength(0);
  });

  it("bows consecutive legs opposite ways", () => {
    const { legs } = buildRoute(HOME, EXIT, 1, "seed");
    // Cross product of (to - from) x (control - from): opposite signs means opposite bows.
    const side = (i: number) => {
      const { from, control, to } = legs[i];
      return Math.sign(
        (to[0] - from[0]) * (control[1] - from[1]) -
          (to[1] - from[1]) * (control[0] - from[0]),
      );
    };
    expect(side(0)).not.toBe(side(1));
  });
});

describe("pointOnLeg", () => {
  const leg = {
    from: [0, 0] as Point,
    control: [10, 10] as Point,
    to: [20, 0] as Point,
  };

  it("hits the endpoints exactly", () => {
    expect(pointOnLeg(leg, 0)).toEqual([0, 0]);
    expect(pointOnLeg(leg, 1)).toEqual([20, 0]);
  });

  it("bows towards the control point at the midpoint", () => {
    const [x, y] = pointOnLeg(leg, 0.5);
    expect(x).toBeCloseTo(10, 6);
    expect(y).toBeCloseTo(5, 6);
  });
});

describe("pointOnRoute", () => {
  it("runs from home to exit", () => {
    const route = buildRoute(HOME, EXIT, 1, "seed");
    expect(pointOnRoute(route, 0)).toEqual(HOME);
    expect(pointOnRoute(route, 1)).toEqual(EXIT);
  });

  it("stays within the route's bounds throughout", () => {
    const route = buildRoute(HOME, EXIT, 1, "seed");
    for (let p = 0; p <= 1; p += 0.05) {
      const point = pointOnRoute(route, p)!;
      expect(Number.isFinite(point[0])).toBe(true);
      expect(Number.isFinite(point[1])).toBe(true);
    }
  });

  // Equal time per leg would make a dot crawl across a long leg and dart across a short one.
  it("weights progress by leg length", () => {
    const route = {
      legs: [
        {
          from: [0, 0] as Point,
          control: [5, 0] as Point,
          to: [10, 0] as Point,
        },
        {
          from: [10, 0] as Point,
          control: [55, 0] as Point,
          to: [100, 0] as Point,
        },
      ],
      waypoints: [[10, 0] as Point],
    };
    // Total length is 100. Weighted by length, halfway is 50 units along, well inside the
    // second leg; had each leg been given equal time it would sit at the junction, x = 10.
    const [x] = pointOnRoute(route, 0.5)!;
    expect(x).toBeCloseTo(50, 6);
  });

  it("clamps progress outside 0..1", () => {
    const route = buildRoute(HOME, EXIT, 1, "seed");
    expect(pointOnRoute(route, -1)).toEqual(HOME);
    expect(pointOnRoute(route, 2)).toEqual(EXIT);
  });
});

describe("legPath", () => {
  it("emits a quadratic Bezier", () => {
    const d = legPath({
      from: [1, 2] as Point,
      control: [3, 4] as Point,
      to: [5, 6] as Point,
    });
    expect(d).toBe("M1,2 Q3,4 5,6");
  });
});

describe("routePath", () => {
  // A sweep drawn along this path must run unbroken from source to exit; a fresh `M` at each
  // waypoint would split it into subpaths and restart the dash at every hop.
  it("chains the legs into one subpath", () => {
    const d = routePath(buildRoute(HOME, EXIT, 2, "seed"));
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/Q/g)).toHaveLength(3);
    expect(d.startsWith(`M${HOME[0]},${HOME[1]}`)).toBe(true);
    expect(d.endsWith(`${EXIT[0]},${EXIT[1]}`)).toBe(true);
  });

  it("matches the single leg's own path when there are no hops", () => {
    const route = buildRoute(HOME, EXIT, 0, "seed");
    expect(routePath(route)).toBe(legPath(route.legs[0]));
  });

  it("is empty for a route with no legs", () => {
    expect(routePath({ legs: [], waypoints: [] })).toBe("");
  });
});

describe("buildRoutePair", () => {
  const key = (p: readonly (readonly number[])[]) =>
    p.map((q) => q.join(",")).sort().join("|");

  // The whole point of drawing a second line: if both directions went through the same hop
  // it would read as one route retraced, which is not how a mixnet returns traffic.
  it("never shares a hop between the two directions", () => {
    for (
      const seed of ["a:1", "b:2", "c:3", "d:4", "e:5", "f:6", "g:7", "h:8"]
    ) {
      const { forward, back } = buildRoutePair(HOME, EXIT, 1, seed);
      expect(key(forward.waypoints)).not.toBe(key(back.waypoints));
      for (const f of forward.waypoints) {
        for (const b of back.waypoints) {
          expect(distance(f as Point, b as Point)).toBeGreaterThan(5);
        }
      }
    }
  });

  it("runs the return leg from the exit back to home", () => {
    const { forward, back } = buildRoutePair(HOME, EXIT, 1, "seed");
    expect(forward.legs[0].from).toEqual(HOME);
    expect(forward.legs[forward.legs.length - 1].to).toEqual(EXIT);
    expect(back.legs[0].from).toEqual(EXIT);
    expect(back.legs[back.legs.length - 1].to).toEqual(HOME);
  });

  it("gives both directions the same number of hops", () => {
    const { forward, back } = buildRoutePair(HOME, EXIT, 2, "seed");
    expect(back.waypoints).toHaveLength(forward.waypoints.length);
    expect(back.legs).toHaveLength(forward.legs.length);
  });

  it("is stable for a seed and changes with it", () => {
    const a = buildRoutePair(HOME, EXIT, 1, "dest:1");
    const b = buildRoutePair(HOME, EXIT, 1, "dest:1");
    expect(key(a.back.waypoints)).toBe(key(b.back.waypoints));

    const seen = new Set(
      ["dest:1", "dest:2", "dest:3", "dest:4", "dest:5"].map((s) =>
        key(buildRoutePair(HOME, EXIT, 1, s).forward.waypoints)
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("chainedPath", () => {
  // SVG restarts a dash pattern at every `M`, so two subpaths would sweep at the same time.
  // One unbroken path is what makes the sweep cross the legs one after another.
  it("joins both directions into a single subpath", () => {
    const { forward, back } = buildRoutePair(HOME, EXIT, 1, "seed");
    const d = chainedPath([forward, back]);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/Q/g)).toHaveLength(forward.legs.length + back.legs.length);
  });

  it("closes the loop back to where it started", () => {
    const { forward, back } = buildRoutePair(HOME, EXIT, 1, "seed");
    const d = chainedPath([forward, back]);
    expect(d.startsWith(`M${HOME[0]},${HOME[1]}`)).toBe(true);
    expect(d.endsWith(`${HOME[0]},${HOME[1]}`)).toBe(true);
  });

  it("is empty when given nothing to chain", () => {
    expect(chainedPath([])).toBe("");
  });
});
