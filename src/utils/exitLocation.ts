import type { Destination } from "@src/services/vpnService.ts";
import { type Point, project } from "./mercator.ts";
import { resolveRegion } from "./regions.ts";

/// How precisely an exit could be placed - a city marker means something different to the
/// reader than "somewhere in this country", so the UI can say which it is showing.
export type ExitPrecision = "city" | "country";

export interface ExitLocation {
  readonly point: Point;
  readonly precision: ExitPrecision;
}

/// Where to draw an exit node on the map.
///
/// Operators publish coordinates as destination metadata, but only configured destinations
/// carry them today and a daemon older than that change sends none at all, so the country the
/// flag names is the fallback rather than an error case.
export function resolveExitLocation(
  destination: Destination,
): ExitLocation | undefined {
  const { latitude, longitude } = destination.meta;
  if (
    typeof latitude === "number" && typeof longitude === "number"
  ) {
    return { point: project(longitude, latitude), precision: "city" };
  }

  const region = resolveRegion(destination.meta.flag);
  if (region) return { point: region.point, precision: "country" };

  return undefined;
}
