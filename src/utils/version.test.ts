import { describe, expect, it } from "vitest";
import { detectChannel } from "./version.ts";

describe("experimental channel", () => {
  const EXP = "2026.09.20+build.144124.experimental";

  it("detects the experimental segment, not just the separator", () => {
    expect(detectChannel(EXP)).toBe("experimental");
    // The pipeline slugs `+` to `-` for registries that reject it.
    expect(detectChannel("2026.09.20-build.144124.experimental")).toBe(
      "experimental",
    );
    // A plain snapshot must not be swept up.
    expect(detectChannel("2026.09.20+build.144124")).toBe("snapshot");
  });
});

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
