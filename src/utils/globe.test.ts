import { describe, expect, it } from "vitest";

import {
  arcPoints,
  DESTINATION_RADIUS,
  easeLinks,
  easePositions,
  graticule,
  HOME,
  layoutSlots,
  type Link,
  linkWidth,
  markedIds,
  MAX_LINK_WIDTH,
  MIN_LINK_WIDTH,
  onSphere,
  type Point,
  ringSlots,
  WIRE_RADIUS,
} from "./globe.ts";

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const spotAt = (angle: number) =>
  onSphere(0.8 * Math.cos(angle), 0.8 * Math.sin(angle));

describe("ringSlots", () => {
  it("spaces ids evenly around a full circle", () => {
    const slots = [
      ...ringSlots(["a", "b", "c", "d"], 0.5, 0, 2 * Math.PI)
        .values(),
    ];
    const gaps = slots.map((slot, n) =>
      distance(slot, slots[(n + 1) % slots.length])
    );
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9);
    for (const slot of slots) {
      expect(Math.hypot(slot.x, slot.y)).toBeCloseTo(0.5, 9);
    }
  });

  it("puts a lone id at the centre of its arc", () => {
    const slot = ringSlots(["a"], 0.5, Math.PI / 2, 1).get("a")!;
    expect(slot.x).toBeCloseTo(0, 9);
    expect(slot.y).toBeCloseTo(0.5, 9);
  });

  it("is empty without ids", () => {
    expect(ringSlots([], 0.5, 0, 1).size).toBe(0);
  });
});

describe("layoutSlots", () => {
  it("rings wire endpoints close to the host and destinations by the rim", () => {
    const slots = layoutSlots(
      ["relay", "other", "dest"],
      new Set(["relay"]),
      new Set(["dest"]),
    );
    expect(Math.hypot(slots.get("relay")!.x, slots.get("relay")!.y))
      .toBeCloseTo(WIRE_RADIUS, 9);
    expect(Math.hypot(slots.get("other")!.x, slots.get("other")!.y))
      .toBeCloseTo(WIRE_RADIUS, 9);
    expect(Math.hypot(slots.get("dest")!.x, slots.get("dest")!.y))
      .toBeCloseTo(DESTINATION_RADIUS, 9);
  });

  it("gives the same ids the same slots whatever order they come in", () => {
    const relays = new Set(["r1", "r2"]);
    const first = layoutSlots(["r2", "x", "r1"], relays, new Set());
    const second = layoutSlots(["x", "r1", "r2"], relays, new Set());
    expect(second).toEqual(first);
  });

  it("keeps the relays next to each other on the ring", () => {
    const relays = new Set(["r1", "r2"]);
    const slots = layoutSlots(["a", "r1", "b", "r2"], relays, new Set());
    const ring = ringSlots(
      ["r1", "r2", "a", "b"],
      WIRE_RADIUS,
      Math.PI,
      2 * Math.PI,
    );
    expect(slots).toEqual(ring);
  });
});

describe("easePositions", () => {
  it("puts a new dot straight on its slot", () => {
    const positions = new Map<string, Point>();
    easePositions(positions, new Map([["a", { x: 0.3, y: 0.1 }]]), 16);
    expect(positions.get("a")).toEqual({ x: 0.3, y: 0.1 });
  });

  it("slides a dot toward a moved slot and settles on it", () => {
    const positions = new Map<string, Point>([["a", { x: 0, y: 0.4 }]]);
    const slots = new Map([["a", { x: 0.4, y: 0 }]]);
    expect(easePositions(positions, slots, 100)).toBe(true);
    const halfway = positions.get("a")!;
    expect(halfway.x).toBeGreaterThan(0);
    expect(halfway.x).toBeLessThan(0.4);
    let moving = true;
    for (let n = 0; n < 200 && moving; n++) {
      moving = easePositions(positions, slots, 50);
    }
    expect(moving).toBe(false);
    expect(positions.get("a")).toEqual({ x: 0.4, y: 0 });
  });

  it("forgets dots without a slot", () => {
    const positions = new Map<string, Point>([["a", { x: 0, y: 0.4 }]]);
    easePositions(positions, new Map(), 16);
    expect(positions.size).toBe(0);
  });
});

describe("arcPoints", () => {
  it("starts at the home point and ends at the endpoint", () => {
    const to = spotAt(1);
    const points = arcPoints(HOME, to, 16);
    expect(points).toHaveLength(17);
    expect(points[0].x).toBeCloseTo(HOME.x, 9);
    expect(points[0].y).toBeCloseTo(HOME.y, 9);
    expect(points[16].x).toBeCloseTo(to.x, 9);
    expect(points[16].y).toBeCloseTo(to.y, 9);
  });

  it("bends every arc to the same side, even across the center", () => {
    const from = spotAt(Math.PI);
    // Left of the chord, seen from the start: a positive cross product.
    const side = (to: Point, middle: Point) =>
      (to.x - from.x) * (middle.y - from.y) -
      (to.y - from.y) * (middle.x - from.x);
    for (const angle of [0, 0.5, -2]) {
      const to = spotAt(angle);
      const middle = arcPoints(from, to, 16)[8];
      const chord = distance(to, from);
      // Clearly off the straight line, not a rounding wobble.
      expect(side(to, middle) / chord).toBeGreaterThan(0.05 * chord);
    }
  });

  it("stays on the globe", () => {
    for (let n = 0; n < 200; n++) {
      for (const point of arcPoints(spotAt(Math.PI), spotAt(n / 10), 16)) {
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("graticule", () => {
  it("draws only lines on the visible hemisphere", () => {
    const lines = graticule();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(1);
      for (const point of line) {
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe("linkWidth", () => {
  it("draws no line without traffic", () => {
    expect(linkWidth(0)).toBe(0);
    expect(linkWidth(-5)).toBe(0);
    expect(linkWidth(Number.NaN)).toBe(0);
  });

  it("keeps a trickle visible and caps a flood", () => {
    expect(linkWidth(1)).toBe(MIN_LINK_WIDTH);
    expect(linkWidth(1e12)).toBe(MAX_LINK_WIDTH);
  });

  it("grows with traffic", () => {
    const widths = [1e3, 1e4, 1e5, 1e6].map(linkWidth);
    for (let n = 1; n < widths.length; n++) {
      expect(widths[n]).toBeGreaterThan(widths[n - 1]);
    }
  });

  it("gives the same rate the same width every time", () => {
    expect(linkWidth(50_000)).toBe(linkWidth(50_000));
  });
});

describe("easeLinks", () => {
  it("grows a new link from nothing toward its target", () => {
    const links = new Map<string, Link>();
    easeLinks(links, new Map([["a", 8]]), 100);
    const link = links.get("a");
    expect(link).toBeDefined();
    expect(link!.width).toBeGreaterThan(0);
    expect(link!.width).toBeLessThan(8);
  });

  it("settles on the target", () => {
    const links = new Map<string, Link>();
    let animating = true;
    for (let n = 0; n < 100 && animating; n++) {
      animating = easeLinks(links, new Map([["a", 8]]), 50);
    }
    expect(animating).toBe(false);
    expect(links.get("a")!.width).toBe(8);
  });

  it("shrinks a vanished link and then forgets it", () => {
    const links = new Map<string, Link>([["a", { width: 6, target: 6 }]]);
    easeLinks(links, new Map(), 100);
    expect(links.get("a")!.width).toBeLessThan(6);
    for (let n = 0; n < 100; n++) easeLinks(links, new Map(), 50);
    expect(links.has("a")).toBe(false);
  });

  it("reports idle when nothing changes", () => {
    const links = new Map<string, Link>([["a", { width: 4, target: 4 }]]);
    expect(easeLinks(links, new Map([["a", 4]]), 16)).toBe(false);
  });
});

describe("markedIds", () => {
  const endpoint = (id: string, hopr_peer: boolean) => ({
    id,
    sent: 1,
    received: 1,
    hopr_peer,
    tunnel: !hopr_peer,
  });

  it("keeps only the endpoints carrying the mark", () => {
    const endpoints = [endpoint("a", true), endpoint("b", false)];
    const relays = markedIds(endpoints, "hopr_peer", new Set(), new Map());
    const tunnel = markedIds(endpoints, "tunnel", new Set(), new Map());
    expect([...relays]).toEqual(["a"]);
    expect([...tunnel]).toEqual(["b"]);
  });

  it("keeps an endpoint that left the frame while its dot is still fading", () => {
    const links = new Map<string, Link>([["a", { width: 3, target: 0 }]]);
    const ids = markedIds([], "hopr_peer", new Set(["a", "gone"]), links);
    expect([...ids]).toEqual(["a"]);
  });

  it("follows the frame for endpoints that are still listed", () => {
    const links = new Map<string, Link>([["a", { width: 3, target: 3 }]]);
    const ids = markedIds(
      [endpoint("a", false)],
      "hopr_peer",
      new Set(["a"]),
      links,
    );
    expect(ids.size).toBe(0);
  });
});
