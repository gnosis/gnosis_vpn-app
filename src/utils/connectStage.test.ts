import { describe, expect, it } from "vitest";

import { CONNECT_PHASES } from "@src/services/vpnService.ts";
import {
  advanceProgress,
  clampLabel,
  easeInOut,
  phaseCap,
  phaseStart,
  stageStep,
  tween,
} from "./connectStage.ts";

/** Runs `seconds` of 60 fps frames from `shown`. */
function run(
  shown: number,
  phase: Parameters<typeof advanceProgress>[1],
  seconds: number,
): number {
  let value = shown;
  for (let i = 0; i < seconds * 60; i++) {
    value = advanceProgress(value, phase, 1 / 60);
  }
  return value;
}

describe("stageStep", () => {
  it("groups the phases into the mock's four steps, in order", () => {
    const steps = CONNECT_PHASES.map(stageStep);
    expect(steps[0]).toBe(0);
    expect(steps[steps.length - 1]).toBe(3);
    expect(steps).toEqual([...steps].sort());
    expect(new Set(steps)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("treats a phase-less attempt as the first step", () => {
    expect(stageStep(null)).toBe(0);
  });
});

describe("phaseStart and phaseCap", () => {
  it("start each phase after the previous one and inside its step's quarter", () => {
    let previous = -1;
    for (const phase of CONNECT_PHASES) {
      const start = phaseStart(phase);
      expect(start).toBeGreaterThan(previous);
      expect(Math.floor(start * 4)).toBe(stageStep(phase));
      previous = start;
    }
  });

  it("caps a phase short of the next one, and the last at the end", () => {
    expect(phaseCap("init")).toBeLessThan(phaseStart("gather_peer_ips"));
    expect(phaseCap("init")).toBeGreaterThan(phaseStart("init"));
    expect(phaseCap("connection_established")).toBe(1);
  });
});

describe("advanceProgress", () => {
  it("catches up to a phase that started ahead of what is shown", () => {
    expect(run(0, "establish_wg_tunnel", 2)).toBeGreaterThanOrEqual(
      phaseStart("establish_wg_tunnel"),
    );
  });

  it("creeps during a long phase without reaching the next one", () => {
    const after = run(phaseStart("register_wg"), "register_wg", 120);
    expect(after).toBeGreaterThan(phaseStart("register_wg"));
    expect(after).toBeLessThanOrEqual(phaseCap("register_wg"));
  });

  it("winds back when an attempt restarts", () => {
    expect(run(0.9, "init", 2)).toBeLessThan(phaseCap("init"));
  });

  it("starts a phase-less attempt at the beginning", () => {
    expect(run(0, null, 1)).toBeLessThan(phaseStart("gather_peer_ips"));
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
});
