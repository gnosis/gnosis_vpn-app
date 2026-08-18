import type {
  BalanceResponse,
  FundingStatus,
} from "@src/services/vpnService.ts";

export type StatusText = "Sufficient" | "Low" | "Empty" | string;

// The daemon pools wxHOPR/xDAI across channels, Safe, and the node EOA into
// Good/Low/Empty traffic and gas levels (see gnosis_vpn-lib's FundingStatus) —
// this module just reads that verdict instead of re-deriving it. balance's
// funding_status (60s poll, freshest capacity data) is preferred; runModeStatus
// (the ~2s status poll's own computation) is used only until the first balance
// response arrives.
function resolveFundingStatus(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): FundingStatus | null {
  return balance?.funding_status ?? runModeStatus ?? null;
}

function toStatusText(level: FundingStatus["traffic"]): StatusText {
  return level === "Good" ? "Sufficient" : level;
}

export function deriveTrafficStatus(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): StatusText {
  const status = resolveFundingStatus(balance, runModeStatus);
  return status ? toStatusText(status.traffic) : "Sufficient";
}

export function deriveNodeStatus(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): StatusText {
  const status = resolveFundingStatus(balance, runModeStatus);
  return status ? toStatusText(status.gas) : "Sufficient";
}

// Worst of traffic and gas status — the wallet icon must flag either problem.
export function deriveOverallStatus(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): StatusText {
  const traffic = deriveTrafficStatus(balance, runModeStatus);
  const gas = deriveNodeStatus(balance, runModeStatus);
  if (traffic === "Empty" || gas === "Empty") return "Empty";
  if (traffic === "Low" || gas === "Low") return "Low";
  return "Sufficient";
}

// Recommended top-up amounts for the Add Funds modal. The daemon already
// gates these to null while the corresponding level is Good.
export function deriveWxhoprDeficit(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): bigint | null {
  return resolveFundingStatus(balance, runModeStatus)?.wxhopr_deficit ?? null;
}

export function deriveXdaiDeficit(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): bigint | null {
  return resolveFundingStatus(balance, runModeStatus)?.xdai_deficit ?? null;
}

const LEVEL_SEVERITY = { Empty: 2, Low: 1, Good: 0 } as const;

// Describes the worse of traffic/gas for the warning banner. The daemon only
// hands back the two pooled levels (not per-location detail like "Safe out of
// funds" vs "channels out of funds"), so the message is phrased per resource.
export function describeCriticalIssue(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): string | null {
  const status = resolveFundingStatus(balance, runModeStatus);
  if (!status) return null;

  const trafficIsWorse =
    LEVEL_SEVERITY[status.traffic] >= LEVEL_SEVERITY[status.gas];
  const worstLevel = trafficIsWorse ? status.traffic : status.gas;
  if (worstLevel === "Good") return null;

  const urgency = worstLevel === "Empty" ? "empty" : "low";
  return trafficIsWorse
    ? `Traffic funds are ${urgency} — top up wxHOPR`
    : `Gas is ${urgency} — top up xDAI`;
}
