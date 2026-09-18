import { type Region, REGIONS } from "@assets/map/regions.ts";

/// Looks a country up by the same code space the flag art uses.
///
/// Mirrors resolveFlagCode() in Flag.tsx deliberately: a destination showing the German flag
/// should place its marker in Germany, and both have to make the same call on a subdivision
/// code like `us-ca` or a malformed one like `gb-foobar`.
export function resolveRegion(code: string | undefined): Region | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase();
  const exact = REGIONS[lower];
  if (exact) return exact;
  // Map art is country-level, so a subdivision falls back to its parent.
  return REGIONS[lower.split("-")[0]];
}
