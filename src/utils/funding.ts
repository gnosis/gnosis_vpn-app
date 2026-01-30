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

export type GlobalFundingStatus = {
  overall: StatusText;
  safeStatus: StatusText;
  nodeStatus: StatusText;
  criticalIssue?: FundingIssue;
  description?: string;
};

export type BalanceAmounts = {
  safe?: string;
  node?: string;
};

/**
 * @param issues
 * @param balances
 */
export function calculateGlobalFundingStatus(
  issues: FundingIssue[] | undefined,
  balances?: BalanceAmounts,
): GlobalFundingStatus {
  const list = issues ?? [];

  // No issues = well funded
  if (list.length === 0) {
    return {
      overall: "Sufficient",
      safeStatus: "Sufficient",
      nodeStatus: "Sufficient",
    };
  }

  const isBalanceEmpty = (balance?: string): boolean => {
    if (!balance) return true;
    try {
      const threshold = 1000000000000000n; // 0.001 threshold
      return BigInt(balance) < threshold;
    } catch {
      return true;
    }
  };

  const safeIsEmpty = isBalanceEmpty(balances?.safe);
  const nodeIsEmpty = isBalanceEmpty(balances?.node);

  const criticalIssues: FundingIssue[] = ["Unfunded", "ChannelsOutOfFunds"];
  const warningIssues: FundingIssue[] = ["SafeOutOfFunds", "NodeUnderfunded"];
  const lowIssues: FundingIssue[] = ["SafeLowOnFunds", "NodeLowOnFunds"];

  const critical = list.find((issue) => criticalIssues.includes(issue));
  const warning = list.find((issue) => warningIssues.includes(issue));
  const low = list.find((issue) => lowIssues.includes(issue));

  const hasUnfunded = list.includes("Unfunded");
  const hasChannelsOutOfFunds = list.includes("ChannelsOutOfFunds");

  const safeHasIssues = hasUnfunded || list.includes("SafeOutOfFunds") ||
    hasChannelsOutOfFunds;
  const safeLow = list.includes("SafeLowOnFunds");

  const nodeHasIssues = hasUnfunded || list.includes("NodeUnderfunded") ||
    hasChannelsOutOfFunds;
  const nodeLow = list.includes("NodeLowOnFunds");

  const safeStatus: StatusText = safeHasIssues
    ? (safeIsEmpty ? "Empty" : "Low")
    : safeLow
    ? "Low"
    : "Sufficient";

  const nodeStatus: StatusText = nodeHasIssues
    ? (nodeIsEmpty ? "Empty" : "Low")
    : nodeLow
    ? "Low"
    : "Sufficient";

  let overall: StatusText;
  let criticalIssue: FundingIssue | undefined;
  let description: string | undefined;

  const hasAnyBalance = !safeIsEmpty || !nodeIsEmpty;

  if (critical) {
    overall = hasAnyBalance ? "Low" : "Empty";
    criticalIssue = critical;
    description = getIssueDescription(critical);
  } else if (warning) {
    overall = hasAnyBalance ? "Low" : "Empty";
    criticalIssue = warning;
    description = getIssueDescription(warning);
  } else if (low) {
    overall = "Low";
    criticalIssue = low;
    description = getIssueDescription(low);
  } else {
    overall = "Sufficient";
  }

  return {
    overall,
    safeStatus,
    nodeStatus,
    criticalIssue,
    description,
  };
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
