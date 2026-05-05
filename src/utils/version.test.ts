import { describe, expect, it } from "vitest";
import { compareVersions, detectChannel } from "./version.ts";

describe("detectChannel", () => {
  it("returns stable for plain semver", () => {
    expect(detectChannel("1.0.0")).toBe("stable");
    expect(detectChannel("0.7.5")).toBe("stable");
    expect(detectChannel("10.20.30")).toBe("stable");
  });

  it("returns snapshot when version contains a hyphen (pre-release)", () => {
    expect(detectChannel("1.0.0-alpha")).toBe("snapshot");
    expect(detectChannel("1.0.0-rc.1")).toBe("snapshot");
    expect(detectChannel("0.7.5-beta.2")).toBe("snapshot");
  });

  it("returns snapshot when version contains a plus (build metadata)", () => {
    expect(detectChannel("1.0.0+build.42")).toBe("snapshot");
    expect(detectChannel("0.7.5+build.7")).toBe("snapshot");
  });

  it("returns snapshot when version contains both hyphen and plus", () => {
    expect(detectChannel("1.0.0-alpha+build.1")).toBe("snapshot");
  });
});

describe("compareVersions", () => {
  describe("stable versions", () => {
    it("returns 0 for identical versions", () => {
      expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
      expect(compareVersions("0.7.5", "0.7.5")).toBe(0);
    });

    it("orders by major version", () => {
      expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
      expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
    });

    it("orders by minor version when major is equal", () => {
      expect(compareVersions("1.1.0", "1.0.9")).toBeGreaterThan(0);
      expect(compareVersions("1.0.9", "1.1.0")).toBeLessThan(0);
    });

    it("orders by patch version when major and minor are equal", () => {
      expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
      expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    });

    it("treats missing components as zero", () => {
      expect(compareVersions("1.2", "1.2.0")).toBe(0);
      expect(compareVersions("1.2.1", "1.2")).toBeGreaterThan(0);
    });
  });

  describe("snapshot versions with build metadata", () => {
    it("returns 0 for identical snapshot versions", () => {
      expect(compareVersions("1.0.0+build.5", "1.0.0+build.5")).toBe(0);
    });

    it("orders by build number when core version is equal", () => {
      expect(compareVersions("0.7.5+build.10", "0.7.5+build.7"))
        .toBeGreaterThan(0);
      expect(compareVersions("0.7.5+build.7", "0.7.5+build.10")).toBeLessThan(
        0,
      );
    });

    it("ranks a build snapshot higher than the same version with no build", () => {
      expect(compareVersions("1.0.0+build.1", "1.0.0")).toBeGreaterThan(0);
      expect(compareVersions("1.0.0", "1.0.0+build.1")).toBeLessThan(0);
    });

    it("core version dominates build number", () => {
      expect(compareVersions("1.0.1", "1.0.0+build.999")).toBeGreaterThan(0);
      expect(compareVersions("1.0.0+build.999", "1.0.1")).toBeLessThan(0);
    });
  });

  describe("pre-release versions (hyphen)", () => {
    it("strips pre-release suffix before comparing core version", () => {
      // "1.0.0-rc.1" strips to core "1.0.0", same as "1.0.0"
      expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(0);
      // "1.1.0-alpha" core > "1.0.0" core
      expect(compareVersions("1.1.0-alpha", "1.0.0")).toBeGreaterThan(0);
      expect(compareVersions("1.0.0", "1.1.0-alpha")).toBeLessThan(0);
    });
  });

  describe("update-detection scenarios", () => {
    it("detects that an older installed version should update", () => {
      expect(compareVersions("0.7.5", "0.8.0")).toBeLessThan(0);
    });

    it("detects that current version matches latest (no update needed)", () => {
      expect(compareVersions("0.8.0", "0.8.0")).toBe(0);
    });

    it("handles user being ahead of latest (downgrade scenario)", () => {
      expect(compareVersions("0.8.1", "0.8.0")).toBeGreaterThan(0);
    });

    it("detects snapshot build update", () => {
      expect(compareVersions("0.7.5+build.7", "0.7.5+build.10")).toBeLessThan(
        0,
      );
    });

    it("detects no snapshot update when already on latest build", () => {
      expect(compareVersions("0.7.5+build.10", "0.7.5+build.7"))
        .toBeGreaterThan(0);
    });
  });
});
