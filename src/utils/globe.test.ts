import { describe, expect, it } from "vitest";

import {
  angleBetween,
  arcPoints,
  cameraTarget,
  createStage,
  easeCamera,
  endpointGeo,
  exitGeo,
  FADE_SECONDS,
  geoOf,
  type ListedEndpoint,
  MAX_SHOWN_ENDPOINTS,
  MAX_SHOWN_RELAYS,
  MIN_EXIT_ANGLE,
  projector,
  relayGeo,
  stageEndpoints,
  vec,
  YOU,
} from "./globe.ts";

const ids = (count: number, prefix = "") =>
  Array.from(
    { length: count },
    (_, n) => `${prefix}${n.toString(16).padStart(16, "0")}`,
  );

const listed = (
  count: number,
  kind: ListedEndpoint["kind"],
  prefix = "",
): ListedEndpoint[] =>
  ids(count, prefix).map((id, n) => ({ id, kind, rate: 1000 * (count - n) }));

const shownOf = (stage: ReturnType<typeof createStage>, kind?: string) =>
  [...stage.shown.values()].filter((shown) =>
    shown.dying === null && (kind === undefined || shown.kind === kind)
  );

describe("sphere maths", () => {
  it("round-trips between degrees and the unit sphere", () => {
    const [lat, lon] = geoOf(vec([47.4, 8.5]));
    expect(lat).toBeCloseTo(47.4, 9);
    expect(lon).toBeCloseTo(8.5, 9);
  });

  it("measures great-circle distance in degrees", () => {
    expect(angleBetween([0, 0], [0, 90])).toBeCloseTo(90, 9);
    expect(angleBetween([90, 0], [-90, 0])).toBeCloseTo(180, 9);
  });

  it("puts the camera centre straight at the viewer", () => {
    const [x, y, z] = projector([30, 40])(vec([30, 40]));
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(1, 9);
  });

  it("draws arcs from one end to the other", () => {
    const points = arcPoints([10, 10], [40, 60]);
    expect(geoOf(points[0])[0]).toBeCloseTo(10, 6);
    const [lat, lon] = geoOf(points[points.length - 1]);
    expect(lat).toBeCloseTo(40, 6);
    expect(lon).toBeCloseTo(60, 6);
  });

  it("grows an arc only part of the way", () => {
    const half = arcPoints([0, 0], [0, 90], 0.5, 0);
    expect(geoOf(half[half.length - 1])[1]).toBeCloseTo(45, 6);
  });
});

describe("placement", () => {
  it("gives an id the same spot every time", () => {
    expect(relayGeo("41d8be0c6a2f9e13")).toEqual(relayGeo("41d8be0c6a2f9e13"));
    expect(endpointGeo("9f2c4e81a07b3d56", YOU)).toEqual(
      endpointGeo("9f2c4e81a07b3d56", YOU),
    );
  });

  it("keeps every exit far enough from You to read the route", () => {
    for (const id of ids(500, "exit-")) {
      expect(angleBetween(YOU, exitGeo(id))).toBeGreaterThanOrEqual(
        MIN_EXIT_ANGLE,
      );
    }
  });

  it("keeps endpoints away from the poles", () => {
    for (const id of ids(500)) {
      const [lat] = endpointGeo(id, [60, 0]);
      expect(lat).toBeLessThanOrEqual(70);
      expect(lat).toBeGreaterThanOrEqual(-60);
    }
  });
});

describe("camera", () => {
  it("looks between You and the exit, nudged north-east", () => {
    const [lat, lon] = cameraTarget(null);
    expect(lat).toBeCloseTo(Math.min(52, YOU[0] + 12), 6);
    expect(lon).toBeCloseTo(YOU[1] + 12, 6);
  });

  it("glides the short way round the date line", () => {
    const [, lon] = easeCamera([0, 170], [0, -170], 0.25);
    expect(lon).toBeGreaterThan(170);
  });
});

describe("stageEndpoints", () => {
  it("reveals endpoints one at a time, busiest first", () => {
    const stage = createStage();
    const endpoints = listed(5, "other");
    stageEndpoints(stage, endpoints, 0, () => 0);
    expect([...stage.shown.keys()]).toEqual([endpoints[0].id]);
    stageEndpoints(stage, endpoints, 0.1, () => 0);
    expect(stage.shown.size).toBe(1);
    stageEndpoints(stage, endpoints, 0.35, () => 0);
    expect([...stage.shown.keys()]).toEqual([
      endpoints[0].id,
      endpoints[1].id,
    ]);
  });

  it("stops filling at the endpoint cap and the relay cap", () => {
    const stage = createStage();
    const endpoints = [
      ...listed(30, "other"),
      ...listed(25, "relay", "relay-"),
    ];
    for (let t = 0; t < 60; t += 0.05) {
      stageEndpoints(stage, endpoints, t, () => 0);
    }
    expect(shownOf(stage, "relay")).toHaveLength(MAX_SHOWN_RELAYS);
    expect(shownOf(stage).length - MAX_SHOWN_RELAYS).toBe(
      MAX_SHOWN_ENDPOINTS,
    );
  });

  it("swaps the quietest shown endpoint for a busier arrival once full", () => {
    const stage = createStage();
    const endpoints = listed(MAX_SHOWN_ENDPOINTS, "vpn");
    for (let t = 0; t < 30; t += 0.05) {
      stageEndpoints(stage, endpoints, t, () => 0);
    }
    const quietest = endpoints[endpoints.length - 1].id;
    const busy = { id: "busy", kind: "vpn" as const, rate: 1e9 };
    stageEndpoints(stage, [...endpoints, busy], 30, () => 0);
    expect(stage.shown.get("busy")?.dying).toBeNull();
    expect(stage.shown.get(quietest)?.dying).toBe(30);
    // Evicted while still listed, so it keeps fading instead of coming back.
    stageEndpoints(stage, [...endpoints, busy], 30.5, () => 0);
    expect(stage.shown.get(quietest)?.dying).toBe(30);
  });

  it("fades out an endpoint that left and then forgets it", () => {
    const stage = createStage();
    const [only] = listed(1, "other");
    stageEndpoints(stage, [only], 0, () => 0);
    stageEndpoints(stage, [], 1, () => 0);
    expect(stage.shown.get(only.id)?.dying).toBe(1);
    stageEndpoints(stage, [], 1 + FADE_SECONDS, () => 0);
    expect(stage.shown.has(only.id)).toBe(false);
  });

  it("keeps an endpoint that returns before its fade ends", () => {
    const stage = createStage();
    const [only] = listed(1, "other");
    stageEndpoints(stage, [only], 0, () => 0);
    stageEndpoints(stage, [], 1, () => 0);
    stageEndpoints(stage, [only], 1.5, () => 0);
    expect(stage.shown.get(only.id)?.dying).toBeNull();
    expect(stage.shown.get(only.id)?.born).toBe(0);
  });
});
