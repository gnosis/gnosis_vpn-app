import { describe, expect, it } from "vitest";
import { type UpPhase, UpPhaseSchema } from "@src/services/vpnService.ts";
import {
  CONNECT_STEP_COUNT,
  connectProgress,
  connectStep,
  connectStepText,
} from "./connectPhase.ts";

describe("connectProgress", () => {
  it("holds a floor before any phase is known", () => {
    expect(connectProgress(null)).toBe(8);
    expect(connectProgress(undefined)).toBe(8);
  });

  it("reaches 100 on the last phase", () => {
    expect(connectProgress("ConnectionEstablished")).toBe(100);
  });

  it("never decreases along the phase order", () => {
    const values = UpPhaseSchema.options.map(connectProgress);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    expect(values[0]).toBeGreaterThanOrEqual(8);
  });
});

describe("connectStep", () => {
  it("maps every phase onto one of the four steps", () => {
    const expected: Record<UpPhase, number> = {
      Init: 0,
      ResolvingBlokliIps: 0,
      GeneratingWg: 1,
      OpeningBridge: 1,
      RegisterWg: 1,
      OpeningPing: 2,
      GatherPeerIps: 2,
      KillswitchLockdown: 2,
      EstablishWgTunnel: 2,
      VerifyPing: 3,
      AdjustToMain: 3,
      ConnectionEstablished: 3,
    };
    for (const phase of UpPhaseSchema.options) {
      expect(connectStep(phase)).toBe(expected[phase]);
    }
  });

  it("never steps backwards along the phase order", () => {
    const steps = UpPhaseSchema.options.map((p) => connectStep(p)!);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
    }
    expect(steps[0]).toBe(0);
    expect(steps[steps.length - 1]).toBe(CONNECT_STEP_COUNT - 1);
  });

  it("is null while no phase is known", () => {
    expect(connectStep(null)).toBe(null);
    expect(connectStep(undefined)).toBe(null);
  });
});

describe("connectStepText", () => {
  it("names the exit in the last step only", () => {
    expect(connectStepText(0, "Berlin")).toBe(
      "Starting the mixnode in the app",
    );
    expect(connectStepText(3, "Berlin")).toBe("Reaching the exit in Berlin");
  });
});
