import { describe, expect, it } from "vitest";
import { syncAnimationFps } from "./renderProfile.ts";

describe("syncAnimationFps", () => {
  it("runs full rate on a verified GPU with spare cores", () => {
    expect(syncAnimationFps({ softwareRendering: false, cpuCores: 4 })).toBe(
      30,
    );
  });

  it("runs lean on software rendering, however many cores", () => {
    expect(syncAnimationFps({ softwareRendering: true, cpuCores: 16 })).toBe(
      15,
    );
  });

  it("runs lean on two cores or fewer, even with a GPU", () => {
    expect(syncAnimationFps({ softwareRendering: false, cpuCores: 2 })).toBe(
      15,
    );
    expect(syncAnimationFps({ softwareRendering: false, cpuCores: 1 })).toBe(
      15,
    );
  });

  it("runs lean when the profile is unknown", () => {
    expect(syncAnimationFps(undefined)).toBe(15);
  });
});
