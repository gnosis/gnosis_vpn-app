import type {
  BalanceResponse,
  FundingIssue,
} from "@src/services/vpnService.ts";
import { BYTES_PER_GB, computeEffectiveCredit } from "@src/utils/credit.ts";

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
 *   <  0.003 xDAI -> Empty
 *   <  0.005 xDAI -> Low
 *   >= 0.005 xDAI -> Sufficient (the Gas Fees row renders no label for it)
 *
 * The daemon's funding issues remain as fallback until the first balance
 * response arrives.
 *
 * Keep thresholds in sync with src-tauri/src/icons.rs (tray icon).
 */

export const TRAFFIC_EMPTY_BELOW = 3n * BYTES_PER_GB;
export const TRAFFIC_LOW_BELOW = 5n * BYTES_PER_GB;
// 0.003 / 0.005 xDAI in wei
export const XDAI_EMPTY_BELOW = 3_000_000_000_000_000n;
export const XDAI_LOW_BELOW = 5_000_000_000_000_000n;

export function deriveTrafficStatus(
  balance: BalanceResponse | null,
  issues: FundingIssue[],
): StatusText {
  if (!balance?.capacity_allocations) return trafficStatusFromIssues(issues);
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
