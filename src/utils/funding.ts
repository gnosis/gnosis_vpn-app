import type {
  BalanceResponse,
  FundingLevel,
  FundingStatus,
  PreparingSafe,
} from "@src/services/vpnService.ts";
import { BYTES_PER_GB } from "@src/utils/credit.ts";

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

// Daemon already gates these to null while the corresponding level is Good.
export function deriveWxhoprDeficit(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
): bigint | null {
  return resolveFundingStatus(balance, runModeStatus)?.wxhopr_deficit ?? null;
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

/** Before the safe exists the daemon's recommendation is the only target: the wxHOPR still missing, or null once met. */
export function preparingSafeShortfall(
  runMode: PreparingSafe | null,
): bigint | null {
  const recommended = runMode?.balance_recommendation?.wxhopr;
  if (!runMode || recommended === undefined) return null;
  const have = runMode.node_wxhopr;
  return have < recommended ? recommended - have : null;
}

/** Rounds `amount` up to the next multiple of `step`. */
export function roundUpToStep(amount: bigint, step: bigint): bigint {
  return ((amount + step - 1n) / step) * step;
}

/** Data asks are rounded up to whole multiples of this. */
export const DATA_SEND_STEP = 5n * BYTES_PER_GB;

/** `wxhopr` as data at the PIX `pricePerByte`, rounded up to whole `step` (5 GB by default); null without a price. */
export function dataToSend(
  wxhopr: bigint,
  pricePerByte: bigint,
  step: bigint = DATA_SEND_STEP,
): bigint | null {
  if (pricePerByte <= 0n) return null;
  return roundUpToStep((wxhopr + pricePerByte - 1n) / pricePerByte, step);
}

/** A {@link dataToSend} amount, always whole GB. */
export function formatDataToSend(bytes: bigint): string {
  return `${bytes / BYTES_PER_GB} GB`;
}
