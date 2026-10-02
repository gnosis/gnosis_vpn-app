import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Accessor, createRoot, createSignal } from "solid-js";
import { createDeadlineClock } from "./deadlineClock.ts";

const START = Date.parse("2026-10-14T23:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Effects run once the root's setup returns, so assertions happen outside it.
function clock(deadline: Accessor<number>) {
  return createRoot((dispose) => ({
    now: createDeadlineClock(deadline),
    dispose,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDeadlineClock", () => {
  it("refreshes exactly when the deadline passes", () => {
    const { now, dispose } = clock(() => START + HOUR);
    expect(now()).toBe(START);

    vi.advanceTimersByTime(HOUR - 1);
    expect(now()).toBe(START);

    vi.advanceTimersByTime(1);
    expect(now()).toBe(START + HOUR);
    dispose();
  });

  // setTimeout fires at once for delays past 2^31-1 ms (~24.8 days).
  it("does not fire early for deadlines weeks away", () => {
    const { now, dispose } = clock(() => START + 60 * DAY);

    vi.advanceTimersByTime(30 * DAY);
    expect(now()).toBe(START);

    vi.advanceTimersByTime(30 * DAY);
    expect(now()).toBe(START + 60 * DAY);
    dispose();
  });

  it("schedules nothing for a deadline that is not a number", () => {
    const { now, dispose } = clock(() => Number.NaN);
    expect(vi.getTimerCount()).toBe(0);
    expect(now()).toBe(START);
    dispose();
  });

  it("follows a deadline that changes and stops once disposed", () => {
    const [deadline, setDeadline] = createSignal(START + 1000);
    const { now, dispose } = clock(deadline);

    setDeadline(START + 5000);
    vi.advanceTimersByTime(1000);
    expect(now()).toBe(START);

    vi.advanceTimersByTime(4000);
    expect(now()).toBe(START + 5000);

    setDeadline(START + 10_000);
    dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
