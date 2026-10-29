/**
 * Watches for an incoming transfer on the Add funds page: a snapshot of both
 * balances is taken when the user copies the address or opens the funding
 * tool, and the first balance to rise above its snapshot is the transfer.
 * Pure: the page feeds it balances and the clock.
 */

/** How long the page keeps waiting before it falls back to the idle line. */
export const TRANSFER_WAIT_MS = 15 * 60 * 1000;

export type Token = "wxhopr" | "xdai";

export interface Balances {
  wxhopr: bigint;
  xdai: bigint;
}

export type TransferWatch =
  | { phase: "idle" }
  | { phase: "waiting"; since: number; snapshot: Balances }
  | { phase: "received"; token: Token; delta: bigint; balance: bigint };

export const IDLE: TransferWatch = { phase: "idle" };

/** The user just copied the address or opened the funding tool. */
export function startWaiting(balances: Balances, now: number): TransferWatch {
  return { phase: "waiting", since: now, snapshot: { ...balances } };
}

/**
 * A new balance arrived. Waiting turns into received when either token rose;
 * waiting past the deadline falls back to idle; received stays received.
 */
export function observe(
  watch: TransferWatch,
  balances: Balances,
  now: number,
): TransferWatch {
  if (watch.phase !== "waiting") return watch;
  for (const token of ["wxhopr", "xdai"] as const) {
    const delta = balances[token] - watch.snapshot[token];
    if (delta > 0n) {
      return { phase: "received", token, delta, balance: balances[token] };
    }
  }
  if (now - watch.since >= TRANSFER_WAIT_MS) return IDLE;
  return watch;
}

/** Whether the page should ask for faster balance polling. */
export function wantsFastPolling(watch: TransferWatch): boolean {
  return watch.phase === "waiting";
}
