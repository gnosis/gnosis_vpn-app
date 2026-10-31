import type { RouteHealthView } from "@src/services/vpnService.ts";
import {
  type ExitData,
  type RankContext,
  type RouteGrade,
  routeGrade,
} from "@src/utils/destinations.ts";
import type { DestinationState } from "@src/services/vpnService.ts";
import {
  formatExitHealthStatus,
  getRouteVerdict,
} from "@src/utils/exitHealth.ts";

/**
 * The picker's grade: `routeGrade`, except that a destination the daemon has
 * not walked yet reads as unmeasured rather than weak or none. `routeGrade`
 * only calls a ready-but-unprobed route unmeasured; a route with no walk at
 * all would otherwise show as a weak route (Routable) or a dead end.
 */
export function pickerGrade(
  state: DestinationState | undefined,
  exit: ExitData | null,
  context: RankContext,
  weakSurfaced = true,
): RouteGrade {
  const rh = state?.route_health;
  if (rh && getRouteVerdict(rh, exit) === "checking") {
    return { kind: "unmeasured" };
  }
  return routeGrade(state, context, weakSurfaced);
}

export interface PickerVerdict {
  /** A plain verdict, bold in the tooltip and part of the row's accessible name. */
  headline: string;
  /** One line for newer users. */
  context: string;
}

const MEASURED: Record<1 | 2 | 3 | 4, PickerVerdict> = {
  4: {
    headline: "Fast and ready",
    context: "Low delay. A good pick.",
  },
  3: { headline: "Ready", context: "Works well for everyday browsing." },
  2: {
    headline: "Ready, a bit slower",
    context: "Works fine; pages may take a moment longer.",
  },
  1: { headline: "Ready, but slow", context: "Expect noticeable delay." },
};

const WEAK: PickerVerdict = {
  headline: "Weak route",
  context:
    "Connects, but the path through the network is unreliable right now.",
};

const CHECKING: PickerVerdict = {
  headline: "Checking…",
  context: "Measuring this location. Takes a few seconds.",
};

const FULL_CONTEXT = "No free slots right now. Pick another location.";
const UNREACHABLE_CONTEXT =
  "Can't be reached right now. Pick another location.";

/** Headline and context for a grade; `none` states what the route health says. */
export function pickerVerdict(
  grade: RouteGrade,
  routeHealth: RouteHealthView | null,
  exit: ExitData | null,
  weakSurfaced = true,
): PickerVerdict {
  switch (grade.kind) {
    case "measured":
      return MEASURED[grade.bars];
    case "weak":
      return WEAK;
    case "unmeasured":
      return CHECKING;
    case "none": {
      if (!routeHealth) {
        return { headline: "Unavailable", context: UNREACHABLE_CONTEXT };
      }
      const verdict = getRouteVerdict(routeHealth, exit, weakSurfaced);
      if (verdict === "checking") return CHECKING;
      return {
        headline: formatExitHealthStatus(routeHealth, exit, weakSurfaced),
        context: verdict === "full" ? FULL_CONTEXT : UNREACHABLE_CONTEXT,
      };
    }
  }
}
