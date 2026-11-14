import type {
  BalanceResponse,
  FundingLevel,
  FundingStatus,
  PreparingSafe,
} from "@src/services/vpnService.ts";

export type StatusText = "Sufficient" | "Low" | "Empty" | string;

/** The levels the client reports: balance's funding_status (fresher) wins, runModeStatus is the pre-balance fallback. */
export function resolveFundingStatus(
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

/** Before the safe exists the daemon's recommendation is the only target: what is still missing, or null once met. */
export function preparingSafeShortfall(
  runMode: PreparingSafe | null,
  token: "wxhopr" | "xdai",
): bigint | null {
  const recommended = runMode?.balance_recommendation?.[token];
  if (!runMode || recommended === undefined) return null;
  const have = token === "wxhopr" ? runMode.node_wxhopr : runMode.node_xdai;
  return have < recommended ? recommended - have : null;
}

/** wxHOPR asks are rounded up to whole multiples of this. */
export const WXHOPR_SEND_STEP = 10n * 10n ** 18n;

/** Rounds `amount` up to the next multiple of `step`. */
export function roundUpToStep(amount: bigint, step: bigint): bigint {
  return ((amount + step - 1n) / step) * step;
}
