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
 *   3. SafeOutOfFunds     - Cannot top up channels (Safe wxHOPR < 4 × ticket_value)
 *   4. NodeUnderfunded    - Cannot open/top up channels (node xDai < 0.00075)
 *
 * Low (Preventive):
 *   5. SafeLowOnFunds     - Warning before SafeOutOfFunds
 *   6. NodeLowOnFunds     - Warning before NodeUnderfunded
 *
 * Empty vs Low rendering is driven by the user's *total* wxHOPR pool
 * (safe + channels_out) and the node xDai balance — not by safe alone or
 * channels alone. The backend issue flags still determine whether something
 * is wrong; the balance check only decides if "Empty" or "Low" is shown.
 */

export type GlobalFundingStatus = {
  overall: StatusText;
  wxhoprStatus: StatusText;
  nodeStatus: StatusText;
  criticalIssue?: FundingIssue;
  description?: string;
};

export type BalanceAmounts = {
  /** Combined wxHOPR pool: `safe + channels_out` in wei (decimal string). */
  wxhopr?: string;
  /** Node EOA xDai in wei (decimal string). */
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
      wxhoprStatus: "Sufficient",
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

  const wxhoprIsEmpty = isBalanceEmpty(balances?.wxhopr);
  const nodeIsEmpty = isBalanceEmpty(balances?.node);

  const criticalIssues: FundingIssue[] = ["Unfunded", "ChannelsOutOfFunds"];
  const warningIssues: FundingIssue[] = ["SafeOutOfFunds", "NodeUnderfunded"];
  const lowIssues: FundingIssue[] = ["SafeLowOnFunds", "NodeLowOnFunds"];

  const critical = list.find((issue) => criticalIssues.includes(issue));
  const warning = list.find((issue) => warningIssues.includes(issue));
  const low = list.find((issue) => lowIssues.includes(issue));

  const hasUnfunded = list.includes("Unfunded");
  const hasChannelsOutOfFunds = list.includes("ChannelsOutOfFunds");

  const wxhoprHasIssues = hasUnfunded || list.includes("SafeOutOfFunds") ||
    hasChannelsOutOfFunds;
  const wxhoprLow = list.includes("SafeLowOnFunds");

  const nodeHasIssues = hasUnfunded || list.includes("NodeUnderfunded") ||
    hasChannelsOutOfFunds;
  const nodeLow = list.includes("NodeLowOnFunds");

  const wxhoprStatus: StatusText = wxhoprHasIssues
    ? (wxhoprIsEmpty ? "Empty" : "Low")
    : wxhoprLow
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

  const hasAnyBalance = !wxhoprIsEmpty || !nodeIsEmpty;

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
    wxhoprStatus,
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
      return "Channels out of funds - no traffic possible";
    case "SafeOutOfFunds":
      return "Out of funds - cannot top up channels";
    case "SafeLowOnFunds":
      return "Low on funds - top up soon";
    case "NodeUnderfunded":
      return "Node underfunded - cannot manage channels";
    case "NodeLowOnFunds":
      return "Node low on funds - top up soon";
  }
}
