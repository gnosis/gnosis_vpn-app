import { describe, expect, it } from "vitest";
import { UpPhaseSchema } from "@src/services/vpnService.ts";
import { connectProgress } from "./connectPhase.ts";

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
