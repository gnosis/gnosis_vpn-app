import { describe, expect, it } from "vitest";
import { createTapSequence } from "./tapSequence.ts";

function tapAt(tap: (nowMs: number) => boolean, times: number[]): boolean[] {
  return times.map((t) => tap(t));
}

describe("createTapSequence", () => {
  it("fires on the seventh quick tap only", () => {
    const fired = tapAt(createTapSequence(7, 500), [
      0,
      100,
      200,
      300,
      400,
      500,
      600,
    ]);
    expect(fired).toEqual([false, false, false, false, false, false, true]);
  });

  it("starts over after a slow tap", () => {
    const tap = createTapSequence(3, 500);
    expect(tapAt(tap, [0, 100, 700, 800, 900])).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("needs a full new sequence after firing", () => {
    const tap = createTapSequence(2, 500);
    expect(tapAt(tap, [0, 100, 200, 300])).toEqual([false, true, false, true]);
  });
});
