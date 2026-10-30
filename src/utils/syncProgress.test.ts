import { describe, expect, it } from "vitest";
import {
  FLOOR_STEP_MS,
  stepTowardsFloor,
  syncProgressDigits,
} from "./syncProgress.ts";

describe("stepTowardsFloor", () => {
  it("holds until the first step is due", () => {
    expect(stepTowardsFloor(10, 25, FLOOR_STEP_MS - 1)).toBe(10);
  });

  it("climbs 1% per step", () => {
    expect(stepTowardsFloor(10, 25, FLOOR_STEP_MS)).toBe(11);
    expect(stepTowardsFloor(10, 25, 5 * FLOOR_STEP_MS + 300)).toBe(15);
  });

  it("stops at the floor", () => {
    expect(stepTowardsFloor(10, 25, 60 * FLOOR_STEP_MS)).toBe(25);
    expect(stepTowardsFloor(24.5, 25, FLOOR_STEP_MS)).toBe(25);
  });
});

describe("syncProgressDigits", () => {
  it("shows whole percents, rounded down", () => {
    expect(syncProgressDigits(37.98, false)).toEqual({
      whole: "37",
      fraction: null,
    });
    expect(syncProgressDigits(99.999, false).whole).toBe("99");
  });

  it("shows hundredths, rounded down, when asked", () => {
    expect(syncProgressDigits(37.468, true)).toEqual({
      whole: "37",
      fraction: "46",
    });
    expect(syncProgressDigits(40, true)).toEqual({
      whole: "40",
      fraction: "00",
    });
    expect(syncProgressDigits(99.996, true)).toEqual({
      whole: "99",
      fraction: "99",
    });
  });

  it("survives float error at hundredths", () => {
    expect(syncProgressDigits(0.29, true).fraction).toBe("29");
    expect(syncProgressDigits(40.01, true).fraction).toBe("01");
  });

  it("caps at 100", () => {
    expect(syncProgressDigits(100.4, false).whole).toBe("100");
    expect(syncProgressDigits(100.4, true)).toEqual({
      whole: "100",
      fraction: "00",
    });
  });
});
