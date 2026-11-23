import type {
  BalanceResponse,
  FundingLevel,
  FundingStatus,
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

/** Rounds `amount` up to the next multiple of `step`. */
export function roundUpToStep(amount: bigint, step: bigint): bigint {
  return ((amount + step - 1n) / step) * step;
}

/** `wxhopr` as data at the PIX `pricePerByte`, rounded up to whole GB; null without a price. */
export function dataToSend(
  wxhopr: bigint,
  pricePerByte: bigint,
): bigint | null {
  if (pricePerByte <= 0n) return null;
  return roundUpToStep(
    (wxhopr + pricePerByte - 1n) / pricePerByte,
    BYTES_PER_GB,
  );
}

/** A {@link dataToSend} amount, always whole GB. */
export function formatDataToSend(bytes: bigint): string {
  return `${bytes / BYTES_PER_GB} GB`;
}

/** The Low/Empty warning the main screen and the Usage tab share; null while traffic is Sufficient. */
export function balanceWarning(
  balance: BalanceResponse | null,
  runModeStatus: FundingStatus | null,
  pricePerByte: bigint,
): { status: "Low" | "Empty"; text: string } | null {
  const funding = resolveFundingStatus(balance, runModeStatus);
  if (!funding || funding.traffic === "good") return null;
  const status = funding.traffic === "empty" ? "Empty" : "Low";
  // The client's wxHOPR back to Good, as data at the PIX price.
  const deficit = funding.wxhopr_deficit;
  const toAdd = deficit === null ? null : dataToSend(deficit, pricePerByte);
  const ask = toAdd === null
    ? "add data"
    : `add at least ${formatDataToSend(toAdd)} of data`;
  return {
    status,
    text: `Balance ${status.toLowerCase()}, ${ask} to stay connected`,
  };
}
