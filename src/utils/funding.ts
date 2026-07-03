import type { FundingIssue } from "@src/services/vpnService.ts";

export type StatusText = "Sufficient" | "Low" | "Empty" | string;

/**
 * Global funding state priority (highest to lowest):
 *
 * Critical (Cannot Work):
 *   1. Unfunded           - Initial state, nothing funded
 *   2. ChannelsOutOfFunds - No traffic possible
 *                           Affects BOTH Safe & EOA: Safe empty (no wxHOPR) OR EOA empty (can't pay for chain ops)
 *
 * Warning (Degraded):
 *   3. SafeOutOfFunds     - Cannot top up channels (< 10 wxHOPR in Safe)
 *   4. NodeUnderfunded    - Cannot open/top up channels (< 0.0075 xDai)
 *
 * Low (Preventive):
 *   5. SafeLowOnFunds     - Warning before SafeOutOfFunds
 *   6. NodeLowOnFunds     - Warning before NodeUnderfunded
 */

export function deriveSafeStatus(issues: FundingIssue[]): StatusText {
  if (
    issues.includes("Unfunded") ||
    issues.includes("ChannelsOutOfFunds") ||
    issues.includes("SafeOutOfFunds")
  ) return "Empty";
  if (issues.includes("SafeLowOnFunds")) return "Low";
  return "Sufficient";
}

// Worst of Safe and Node status — the wallet icon must flag either problem.
export function deriveOverallStatus(issues: FundingIssue[]): StatusText {
  const safe = deriveSafeStatus(issues);
  const node = deriveNodeStatus(issues);
  if (safe === "Empty" || node === "Empty") return "Empty";
  if (safe === "Low" || node === "Low") return "Low";
  return "Sufficient";
}

export function deriveNodeStatus(issues: FundingIssue[]): StatusText {
  if (
    issues.includes("Unfunded") ||
    issues.includes("ChannelsOutOfFunds") ||
    issues.includes("NodeUnderfunded")
  ) return "Empty";
  if (issues.includes("NodeLowOnFunds")) return "Low";
  return "Sufficient";
}

// Backend orders issues by priority, so issues[0] is always the most critical.
export function describeCriticalIssue(issues: FundingIssue[]): string | null {
  if (issues.length === 0) return null;
  return getIssueDescription(issues[0]);
}

function getIssueDescription(issue: FundingIssue): string {
  switch (issue) {
    case "Unfunded":
      return "System not funded - cannot work at all";
    case "ChannelsOutOfFunds":
      return "Channels out of funds - no traffic possible (Safe or EOA empty)";
    case "SafeOutOfFunds":
      return "Safe out of funds - cannot top up channels";
    case "SafeLowOnFunds":
      return "Safe low on funds - top up soon";
    case "NodeUnderfunded":
      return "Node underfunded - cannot manage channels";
    case "NodeLowOnFunds":
      return "Node low on funds - top up soon";
  }
}
