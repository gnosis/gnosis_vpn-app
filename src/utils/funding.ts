import type {
  BalanceResponse,
  FundingIssue,
} from "@src/services/vpnService.ts";
import {
  BYTES_PER_GB,
  computeEffectiveCredit,
  sumCapacityStake,
} from "@src/utils/credit.ts";

export type StatusText = "Sufficient" | "Low" | "Empty" | string;

/**
 * Funding status is derived from hard thresholds on the balance response, not
 * from the daemon's funding issues — those only reflect channel/Safe message
 * capacity and read "empty" while funds sit in the Safe or on the node EOA.
 *
 * Traffic (total byte capacity: Safe + channels + node EOA):
 *   <  3 GB -> Empty
 *   <  5 GB -> Low
 *   >= 5 GB -> Sufficient
 *
 * Gas (node xDAI):
 *   <  0.0015 xDAI -> Empty
 *   <  0.0035 xDAI -> Low
 *   >= 0.0035 xDAI -> Sufficient
 *
 * The daemon's funding issues remain as fallback only while there is no
 * capacity data at all (no balance yet, or a fresh daemon that has not
 * computed capacity_allocations). As soon as allocations are present the
 * thresholds win — node EOA funds count toward traffic via the node_eoa
 * allocation entry.
 *
 * Keep thresholds in sync with src-tauri/src/icons.rs (tray icon).
 */

export const TRAFFIC_EMPTY_BELOW = 3n * BYTES_PER_GB;
export const TRAFFIC_LOW_BELOW = 5n * BYTES_PER_GB;
// 0.0015 / 0.0035 xDAI in wei
export const XDAI_EMPTY_BELOW = 1_500_000_000_000_000n;
export const XDAI_LOW_BELOW = 3_500_000_000_000_000n;

export function deriveTrafficStatus(
  balance: BalanceResponse | null,
  issues: FundingIssue[],
): StatusText {
  if (!balance || !balance.capacity_allocations) {
    return trafficStatusFromIssues(issues);
  }
  const totalBytes = computeEffectiveCredit(balance);
  if (totalBytes < TRAFFIC_EMPTY_BELOW) return "Empty";
  if (totalBytes < TRAFFIC_LOW_BELOW) return "Low";
  return "Sufficient";
}

export function deriveNodeStatus(
  balance: BalanceResponse | null,
  issues: FundingIssue[],
): StatusText {
  if (!balance) return nodeStatusFromIssues(issues);
  if (balance.node < XDAI_EMPTY_BELOW) return "Empty";
  if (balance.node < XDAI_LOW_BELOW) return "Low";
  return "Sufficient";
}

// Worst of traffic and gas status — the wallet icon must flag either problem.
export function deriveOverallStatus(
  balance: BalanceResponse | null,
  issues: FundingIssue[],
): StatusText {
  const traffic = deriveTrafficStatus(balance, issues);
  const gas = deriveNodeStatus(balance, issues);
  if (traffic === "Empty" || gas === "Empty") return "Empty";
  if (traffic === "Low" || gas === "Low") return "Low";
  return "Sufficient";
}

// Recommended top-up amounts for the Add Funds modal. ideal_balance is the
// recommended balance from edgli; it sits above the Sufficient thresholds, so
// a positive diff alone does not mean funds are needed — only recommend when
// the corresponding status is Low or Empty.
export function deriveWxhoprDeficit(
  balance: BalanceResponse | null,
  issues: FundingIssue[],
): bigint | null {
  if (deriveTrafficStatus(balance, issues) === "Sufficient") return null;
  if (!balance?.ideal_balance) return null;
  const diff = balance.ideal_balance.wxhopr - sumCapacityStake(balance);
  return diff > 0n ? diff : null;
}

export function deriveXdaiDeficit(
  balance: BalanceResponse | null,
  issues: FundingIssue[],
): bigint | null {
  if (deriveNodeStatus(balance, issues) === "Sufficient") return null;
  if (!balance?.ideal_balance) return null;
  const diff = balance.ideal_balance.xdai - balance.node;
  return diff > 0n ? diff : null;
}

function trafficStatusFromIssues(issues: FundingIssue[]): StatusText {
  if (
    issues.includes("Unfunded") ||
    issues.includes("ChannelsOutOfFunds") ||
    issues.includes("SafeOutOfFunds")
  ) return "Empty";
  if (issues.includes("SafeLowOnFunds")) return "Low";
  return "Sufficient";
}

function nodeStatusFromIssues(issues: FundingIssue[]): StatusText {
  if (issues.includes("Unfunded") || issues.includes("NodeUnderfunded")) {
    return "Empty";
  }
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
