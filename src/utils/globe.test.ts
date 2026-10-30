import { describe, expect, it } from "vitest";

import {
  arcPoints,
  DESTINATION_RING,
  destinationPosition,
  easeLinks,
  endpointPosition,
  graticule,
  HOME,
  type Link,
  linkWidth,
  markedIds,
  MAX_LINK_WIDTH,
  MIN_LINK_WIDTH,
} from "./globe.ts";

const length = (v: { x: number; y: number; z: number }) =>
  Math.hypot(v.x, v.y, v.z);

describe("endpointPosition", () => {
  it("places the same id on the same spot", () => {
    expect(endpointPosition("9f2c4e81a07b3d56")).toEqual(
      endpointPosition("9f2c4e81a07b3d56"),
    );
  });

  it("places every id on the visible side of the globe", () => {
    for (let n = 0; n < 500; n++) {
      const position = endpointPosition(n.toString(16).padStart(16, "0"));
      expect(length(position)).toBeCloseTo(1, 9);
      expect(position.z).toBeGreaterThan(0);
      // Away from the rim, so a dot never sits on the outline.
      expect(Math.hypot(position.x, position.y)).toBeLessThan(0.9);
    }
  });

  it("spreads ids over the disc instead of clustering them", () => {
    const quadrants = new Set<string>();
    for (let n = 0; n < 64; n++) {
      const position = endpointPosition(`id-${n}`);
      quadrants.add(`${position.x > 0}:${position.y > 0}`);
    }
    expect(quadrants.size).toBe(4);
  });
});

describe("destinationPosition", () => {
  it("places the same id on the same spot", () => {
    expect(destinationPosition("7d2a96c0e1f43b58")).toEqual(
      destinationPosition("7d2a96c0e1f43b58"),
    );
  });

  it("keeps destinations in the ring along the rim, clear of the outline", () => {
    for (let n = 0; n < 500; n++) {
      const position = destinationPosition(n.toString(16).padStart(16, "0"));
      const distance = Math.hypot(position.x, position.y);
      expect(length(position)).toBeCloseTo(1, 9);
      expect(position.z).toBeGreaterThan(0);
      expect(distance).toBeGreaterThanOrEqual(DESTINATION_RING.inner - 1e-9);
      expect(distance).toBeLessThanOrEqual(DESTINATION_RING.outer + 1e-9);
      expect(distance).toBeLessThan(0.9);
    }
  });

  it("spreads destinations all around the rim", () => {
    const quadrants = new Set<string>();
    for (let n = 0; n < 64; n++) {
      const position = destinationPosition(`id-${n}`);
      quadrants.add(`${position.x > 0}:${position.y > 0}`);
    }
    expect(quadrants.size).toBe(4);
  });
});

describe("arcPoints", () => {
  it("starts at the home point and ends at the endpoint", () => {
    const to = endpointPosition("41d8be0c6a2f9e13");
    const points = arcPoints(HOME, to, 16);
    expect(points).toHaveLength(17);
    expect(points[0].x).toBeCloseTo(HOME.x, 9);
    expect(points[0].y).toBeCloseTo(HOME.y, 9);
    expect(points[16].x).toBeCloseTo(to.x, 9);
    expect(points[16].y).toBeCloseTo(to.y, 9);
  });

  it("bends every arc to the same side, even across the center", () => {
    // Left of the chord, seen from the start: a positive cross product.
    const side = (
      to: { x: number; y: number },
      middle: { x: number; y: number },
    ) =>
      (to.x - HOME.x) * (middle.y - HOME.y) -
      (to.y - HOME.y) * (middle.x - HOME.x);
    for (
      const id of ["9f2c4e81a07b3d56", "41d8be0c6a2f9e13", "c37a10f5e9d24b88"]
    ) {
      const to = endpointPosition(id);
      const middle = arcPoints(HOME, to, 16)[8];
      const chord = Math.hypot(to.x - HOME.x, to.y - HOME.y);
      // Clearly off the straight line, not a rounding wobble.
      expect(side(to, middle) / chord).toBeGreaterThan(0.05 * chord);
    }
  });

  it("stays on the globe", () => {
    for (let n = 0; n < 200; n++) {
      for (const point of arcPoints(HOME, endpointPosition(`id-${n}`), 16)) {
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
