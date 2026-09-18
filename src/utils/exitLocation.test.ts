import { describe, expect, it } from "vitest";
import { makeDestination } from "@src/testing/destinations.ts";
import { resolveExitLocation } from "./exitLocation.ts";
import { resolveRegion } from "./regions.ts";
import { project } from "./mercator.ts";

describe("resolveExitLocation", () => {
  it("uses the published coordinates when they are there", () => {
    const location = resolveExitLocation(
      makeDestination({
        meta: { flag: "at", latitude: 48.202, longitude: 16.3647 },
      }),
    );
    expect(location?.precision).toBe("city");
    expect(location?.point).toEqual(project(16.3647, 48.202));
  });

  // Coordinates win over the flag: the flag only names a country, and an operator pinning one
  // without the other should still land on the city.
  it("prefers coordinates over the country the flag names", () => {
    const location = resolveExitLocation(
      makeDestination({
        meta: { flag: "de", latitude: 48.202, longitude: 16.3647 },
      }),
    );
    expect(location?.point).toEqual(project(16.3647, 48.202));
  });

  // Every discovered node, and every node behind a daemon older than the coordinate change.
  it("falls back to the country for a destination with no coordinates", () => {
    const location = resolveExitLocation(
      makeDestination({ meta: { flag: "at" } }),
    );
    expect(location?.precision).toBe("country");
    expect(location?.point).toEqual(resolveRegion("at")?.point);
  });

  it("falls back when only one coordinate is published", () => {
    const location = resolveExitLocation(
      makeDestination({ meta: { flag: "at", latitude: 48.202 } }),
    );
    expect(location?.precision).toBe("country");
  });

  it("gives up when there is neither a coordinate nor a known flag", () => {
    expect(resolveExitLocation(makeDestination({}))).toBeUndefined();
    expect(resolveExitLocation(makeDestination({ meta: { flag: "zz" } })))
      .toBeUndefined();
  });
});

describe("resolveRegion", () => {
  it("resolves a plain country code", () => {
    expect(resolveRegion("at")).toBeDefined();
  });

  it("is case insensitive", () => {
    expect(resolveRegion("AT")).toEqual(resolveRegion("at"));
  });

  // Flag.tsx has subdivision art the map does not, so both must agree to fall back to the
  // parent country rather than one showing a marker the other cannot.
  it("falls back from a subdivision to its parent country", () => {
    expect(resolveRegion("us-ca")).toEqual(resolveRegion("us"));
    expect(resolveRegion("gb-sct")).toEqual(resolveRegion("gb"));
  });

  it("falls back from a malformed subdivision the same way", () => {
    expect(resolveRegion("gb-foobar")).toEqual(resolveRegion("gb"));
  });

  it("returns nothing for an unknown code", () => {
    expect(resolveRegion("zz")).toBeUndefined();
    expect(resolveRegion(undefined)).toBeUndefined();
    expect(resolveRegion("")).toBeUndefined();
  });

  it("places its marker inside the country's own bounding box", () => {
    for (const code of ["at", "pl", "us", "hr", "no", "fj", "cl"]) {
      const region = resolveRegion(code)!;
      const [x, y] = region.point;
      const [minX, minY, maxX, maxY] = region.bbox;
      expect(x, code).toBeGreaterThanOrEqual(minX);
      expect(x, code).toBeLessThanOrEqual(maxX);
      expect(y, code).toBeGreaterThanOrEqual(minY);
      expect(y, code).toBeLessThanOrEqual(maxY);
    }
  });
});
