import type {
  BalanceResponse,
  FundingLevel,
  FundingStatus,
} from "@src/services/vpnService.ts";

export type StatusText = "Sufficient" | "Low" | "Empty" | string;

// balance's funding_status (fresher) wins; runModeStatus is the pre-balance fallback.
function resolveFundingStatus(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): FundingStatus | null {
  return balance?.funding_status ?? runModeStatus ?? null;
}

function toStatusText(level: FundingLevel): StatusText {
  switch (level) {
    case "good":
      return "Sufficient";
    case "low":
      return "Low";
    case "empty":
      return "Empty";
  }
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

// Daemon already gates these to null while the corresponding level is Good.
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

// A missing ideal balance outranks a missing top-up reserve, so the deficit wins when both are set.
export function deriveRefillShortfall(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): bigint | null {
  const status = resolveFundingStatus(balance, runModeStatus);
  if (!status || status.wxhopr_deficit !== null) return null;
  return status.refill_shortfall;
}

const LEVEL_SEVERITY = { empty: 2, low: 1, good: 0 } as const;

// Daemon only hands back the two pooled levels, so the message is per-resource.
export function describeCriticalIssue(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): string | null {
  const status = resolveFundingStatus(balance, runModeStatus);
  if (!status) return null;

  const trafficIsWorse =
    LEVEL_SEVERITY[status.traffic] >= LEVEL_SEVERITY[status.gas];
  const worstLevel = trafficIsWorse ? status.traffic : status.gas;
  if (worstLevel === "good") return null;

  const urgency = worstLevel;
  return trafficIsWorse
    ? `Traffic funds are ${urgency} — top up wxHOPR`
    : `Gas is ${urgency} — top up xDAI`;
}
