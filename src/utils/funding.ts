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

// From this much data on, a Low/Empty level means the funds sit in channels and the PIX pool, not that they ran out.
const ALLOCATED_FROM_EMPTY = 5n * BYTES_PER_GB;
const ALLOCATED_FROM_LOW = 10n * BYTES_PER_GB;

/** The Usage tab's warning for a Low or Empty traffic level; `toAdd` is a {@link dataToSend} amount, null when unknown. */
export function balanceWarningText(
  status: "Low" | "Empty",
  creditBytes: bigint,
  toAdd: bigint | null,
): string {
  const allocatedFrom = status === "Empty"
    ? ALLOCATED_FROM_EMPTY
    : ALLOCATED_FROM_LOW;
  const lead = creditBytes >= allocatedFrom
    ? "All data currently allocated"
    : status === "Empty"
    ? "Balance empty"
    : "Balance low";
  const ask = toAdd === null
    ? "add data"
    : `add at least ${formatDataToSend(toAdd)} of data`;
  return `${lead}, ${ask} to stay connected`;
}
