/// Shared easing curves.
///
/// `easeOutCubic` started life inside LocationBanner's scroll animation and now also drives
/// the map's view transition; it lives here so the two cannot drift apart.

/// Fast at first, settling gently — the house curve for anything the user did not initiate.
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}
