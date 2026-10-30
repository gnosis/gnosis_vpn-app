import { describe, expect, it } from "vitest";
import {
  IDLE,
  observe,
  startWaiting,
  TRANSFER_WAIT_MS,
  wantsFastPolling,
} from "./transferWatch.ts";

const T0 = 1_000_000;
const START = { wxhopr: 10n, xdai: 5n };

describe("transferWatch", () => {
  it("snapshots both balances when waiting starts", () => {
    const w = startWaiting(START, T0);
    expect(w).toEqual({ phase: "waiting", since: T0, snapshot: START });
    expect(wantsFastPolling(w)).toBe(true);
    expect(wantsFastPolling(IDLE)).toBe(false);
  });

  it("stays waiting while nothing rises, even if a balance drops", () => {
    const w = startWaiting(START, T0);
    expect(observe(w, { wxhopr: 9n, xdai: 5n }, T0 + 1000)).toBe(w);
  });

  it("reports the first token that rose, with the delta and the new balance", () => {
    const w = startWaiting(START, T0);
    expect(observe(w, { wxhopr: 60n, xdai: 5n }, T0 + 1000)).toEqual({
      phase: "received",
      token: "wxhopr",
      delta: 50n,
      balance: 60n,
    });
    expect(observe(w, { wxhopr: 10n, xdai: 7n }, T0 + 1000)).toEqual({
      phase: "received",
      token: "xdai",
      delta: 2n,
      balance: 7n,
    });
  });

  it("keeps a received transfer whatever comes later", () => {
    const received = observe(
      startWaiting(START, T0),
      { wxhopr: 60n, xdai: 5n },
      T0 + 1,
    );
    expect(observe(received, { wxhopr: 0n, xdai: 0n }, T0 + 2)).toBe(received);
  });

  it("falls back to idle once the wait runs out", () => {
    const w = startWaiting(START, T0);
    expect(observe(w, START, T0 + TRANSFER_WAIT_MS - 1)).toBe(w);
    expect(observe(w, START, T0 + TRANSFER_WAIT_MS)).toBe(IDLE);
  });

  it("a rise at the deadline still counts", () => {
    const w = startWaiting(START, T0);
    expect(
      observe(w, { wxhopr: 11n, xdai: 5n }, T0 + TRANSFER_WAIT_MS).phase,
    ).toBe("received");
  });
});
