import { describe, expect, it } from "vitest";

import {
  arcPoints,
  DESTINATION_RING,
  destinationParents,
  destinationPosition,
  easeLinks,
  endpointPosition,
  graticule,
  HOME,
  hoprPeerIds,
  intermediaryIds,
  type Link,
  linkWidth,
  MAX_LINK_WIDTH,
  MIN_LINK_WIDTH,
  pickIntermediary,
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

describe("hoprPeerIds", () => {
  const endpoint = (id: string, hopr_peer: boolean) => ({
    id,
    sent: 1,
    received: 1,
    hopr_peer,
    tunnel: false,
  });

  it("keeps only the endpoints marked as HOPR peers", () => {
    const ids = hoprPeerIds(
      [endpoint("a", true), endpoint("b", false)],
      new Set(),
      new Map(),
    );
    expect([...ids]).toEqual(["a"]);
  });

  it("keeps a peer that left the frame while its dot is still fading", () => {
    const links = new Map<string, Link>([["a", { width: 3, target: 0 }]]);
    const ids = hoprPeerIds([], new Set(["a", "gone"]), links);
    expect([...ids]).toEqual(["a"]);
  });

  it("follows the frame for endpoints that are still listed", () => {
    const links = new Map<string, Link>([["a", { width: 3, target: 3 }]]);
    const ids = hoprPeerIds([endpoint("a", false)], new Set(["a"]), links);
    expect(ids.size).toBe(0);
  });
});

describe("intermediaryIds", () => {
  const endpoint = (
    id: string,
    { hopr_peer = false, tunnel = false } = {},
  ) => ({ id, sent: 1, received: 1, hopr_peer, tunnel });

  it("uses the HOPR peers on the wire when there are any", () => {
    const ids = intermediaryIds([
      endpoint("busy"),
      endpoint("peer-a", { hopr_peer: true }),
      endpoint("dest", { tunnel: true }),
      endpoint("peer-b", { hopr_peer: true }),
    ]);
    expect(ids).toEqual(["peer-a", "peer-b"]);
  });

  it("falls back to the busiest wire endpoint, as with a single VPN server", () => {
    const ids = intermediaryIds([
      endpoint("dest", { tunnel: true }),
      endpoint("server"),
      endpoint("other"),
    ]);
    expect(ids).toEqual(["server"]);
  });

  it("is empty without wire endpoints", () => {
    expect(intermediaryIds([endpoint("dest", { tunnel: true })])).toEqual([]);
  });
});

describe("pickIntermediary", () => {
  const endpoint = (
    id: string,
    { hopr_peer = false, tunnel = false } = {},
  ) => ({ id, sent: 1, received: 1, hopr_peer, tunnel });

  it("starts with the busiest intermediary", () => {
    const picked = pickIntermediary(
      [
        endpoint("peer-a", { hopr_peer: true }),
        endpoint("peer-b", { hopr_peer: true }),
      ],
      null,
    );
    expect(picked).toBe("peer-a");
  });

  it("keeps the current intermediary while it is still on the wire", () => {
    const picked = pickIntermediary(
      [
        endpoint("peer-a", { hopr_peer: true }),
        endpoint("peer-b", { hopr_peer: true }),
      ],
      "peer-b",
    );
    expect(picked).toBe("peer-b");
  });

  it("moves on once the current intermediary is gone", () => {
    const picked = pickIntermediary(
      [endpoint("peer-a", { hopr_peer: true })],
      "peer-b",
    );
    expect(picked).toBe("peer-a");
  });

  it("has none without wire endpoints", () => {
    expect(pickIntermediary([endpoint("d1", { tunnel: true })], "peer-a"))
      .toBeNull();
  });
});

describe("destinationParents", () => {
  const endpoint = (
    id: string,
    { hopr_peer = false, tunnel = false } = {},
  ) => ({ id, sent: 1, received: 1, hopr_peer, tunnel });

  it("links every listed destination to the shared intermediary", () => {
    const parents = destinationParents(
      [
        endpoint("peer-a", { hopr_peer: true }),
        endpoint("peer-b", { hopr_peer: true }),
        endpoint("d1", { tunnel: true }),
        endpoint("d2", { tunnel: true }),
      ],
      "peer-b",
      new Map(),
      new Map(),
    );
    expect([...parents.entries()]).toEqual([["d1", "peer-b"], [
      "d2",
      "peer-b",
    ]]);
  });

  it("links destinations to the host when nothing carries them", () => {
    const parents = destinationParents(
      [endpoint("d1", { tunnel: true })],
      null,
      new Map(),
      new Map(),
    );
    expect(parents.get("d1")).toBeNull();
  });

  it("keeps the parent of a destination that is still fading out", () => {
    const links = new Map<string, Link>([["d1", { width: 2, target: 0 }]]);
    const parents = destinationParents(
      [endpoint("server")],
      "server",
      new Map([["d1", "old-server"], ["gone", "old-server"]]),
      links,
    );
    expect(parents.get("d1")).toBe("old-server");
    expect(parents.has("gone")).toBe(false);
  });
});
