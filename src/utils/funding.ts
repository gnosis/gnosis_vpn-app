import type { FundingIssue } from "@src/services/vpnService.ts";

export type StatusText = "Sufficient" | "Low" | "Empty" | string;

/**
 * Applies funding issues to Safe and EOA status setters.
 * - Safe issues: SafeOutOfFunds → Empty, SafeLowOnFunds → Low
 * - EOA issues: ChannelsOutOfFunds/NodeUnderfunded → Empty, NodeLowOnFunds → Low
 * - Unfunded implies both are Empty
 * - If both Low and Empty present, Empty wins
 */
export function applyFundingIssues(
  issues: FundingIssue[] | undefined,
  setSafeStatus: (s: StatusText) => void,
  setEOAStatus: (s: StatusText) => void,
): void {
  const list = issues ?? [];

  const hasUnfunded = list.includes("Unfunded");

  // Safe
  const safeEmpty = hasUnfunded || list.includes("SafeOutOfFunds");
  const safeLow = list.includes("SafeLowOnFunds");
  const safeStatus: StatusText = safeEmpty ? "Empty" : safeLow ? "Low" : "Sufficient";

  // EOA (node)
  const eoaEmpty = hasUnfunded || list.includes("NodeUnderfunded");
  const eoaLow = list.includes("NodeLowOnFunds");
  const eoaStatus: StatusText = eoaEmpty ? "Empty" : eoaLow ? "Low" : "Sufficient";

  setSafeStatus(safeStatus);
  setEOAStatus(eoaStatus);
}
