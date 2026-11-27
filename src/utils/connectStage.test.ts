import { describe, expect, it } from "vitest";

import { CONNECT_STEPS } from "@src/services/vpnService.ts";
import {
  advanceProgress,
  clampLabel,
  easeInOut,
  issueCaption,
  stageStep,
  stepCap,
  stepStart,
  tween,
} from "./connectStage.ts";

/** Runs `seconds` of 60 fps frames from `shown`. */
function run(
  shown: number,
  step: Parameters<typeof advanceProgress>[1],
  seconds: number,
): number {
  let value = shown;
  for (let i = 0; i < seconds * 60; i++) {
    value = advanceProgress(value, step, 1 / 60);
  }
  return value;
}

describe("stageStep", () => {
  it("groups the steps into the mock's four stages, in order", () => {
    const steps = CONNECT_STEPS.map(stageStep);
    expect(steps[0]).toBe(0);
    expect(steps[steps.length - 1]).toBe(3);
    expect(steps).toEqual([...steps].sort());
    expect(new Set(steps)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("treats a step-less attempt as the first stage", () => {
    expect(stageStep(null)).toBe(0);
  });
});

describe("stepStart and stepCap", () => {
  it("start each step after the previous one and inside its stage's quarter", () => {
    let previous = -1;
    for (const step of CONNECT_STEPS) {
      const start = stepStart(step);
      expect(start).toBeGreaterThan(previous);
      expect(Math.floor(start * 4)).toBe(stageStep(step));
      previous = start;
    }
  });

  it("caps a step short of the next one, and the last at the end", () => {
    expect(stepCap("checking_exit")).toBeLessThan(stepStart("securing"));
    expect(stepCap("checking_exit")).toBeGreaterThan(
      stepStart("checking_exit"),
    );
    expect(stepCap("verifying")).toBe(1);
  });
});

describe("advanceProgress", () => {
  it("catches up to a phase that started ahead of what is shown", () => {
    expect(run(0, "opening_tunnel", 2)).toBeGreaterThanOrEqual(
      stepStart("opening_tunnel"),
    );
  });

  it("creeps during a long phase without reaching the next one", () => {
    const after = run(stepStart("securing"), "securing", 120);
    expect(after).toBeGreaterThan(stepStart("securing"));
    expect(after).toBeLessThanOrEqual(stepCap("securing"));
  });

  it("winds back when an attempt restarts", () => {
    expect(run(0.9, "checking_exit", 2)).toBeLessThan(stepCap("checking_exit"));
  });

  it("starts a step-less attempt at the beginning", () => {
    expect(run(0, null, 1)).toBeLessThan(stepStart("securing"));
  });
});

describe("issueCaption", () => {
  it("names the issue at the exit and counts the retries", () => {
    expect(
      issueCaption({ kind: "insufficient_funds", attempts: 2 }, "Berlin"),
    ).toBe("Not enough funds to pay the exit in Berlin · retry 2");
  });
});

describe("tween", () => {
  it("holds before begin, eases across the span, and holds after", () => {
    expect(tween(0.1, 1, 0, 0.2, 0.1)).toBe(1);
    expect(tween(0.25, 1, 0, 0.2, 0.1)).toBeCloseTo(0.5);
    expect(tween(0.5, 1, 0, 0.2, 0.1)).toBe(0);
  });

  it("jumps at begin for a zero span", () => {
    expect(tween(0.21, 0, 1, 0.2, 0)).toBe(1);
  });
});

describe("easeInOut", () => {
  it("runs from 0 to 1 through the midpoint", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });
});

describe("clampLabel", () => {
  it("keeps a label that fits", () => {
    expect(clampLabel("Germany", 11)).toBe("Germany");
    expect(clampLabel("Netherlands", 11)).toBe("Netherlands");
  });

  it("cuts a longer one to the limit, ending in an ellipsis", () => {
    expect(clampLabel("United States", 11)).toBe("United Sta…");
    expect(clampLabel("United States", 11)).toHaveLength(11);
  });

  it("drops a space left before the ellipsis", () => {
    expect(clampLabel("Costa Rica", 7)).toBe("Costa…");
  });

  it("counts an emoji as one character and never splits it", () => {
    expect(clampLabel("Amsterdam😀 exit", 11)).toBe("Amsterdam😀…");
    expect(clampLabel("Amsterdam😀", 10)).toBe("Amsterdam😀");
  });
});
