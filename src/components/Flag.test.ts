import { describe, expect, it } from "vitest";
import { resolveFlagCode } from "./Flag.tsx";

describe("resolveFlagCode", () => {
  it("keeps a plain ISO 3166-1 alpha-2 code", () => {
    expect(resolveFlagCode("de")).toBe("de");
  });

  it("keeps a subdivision code flag-icons has art for", () => {
    expect(resolveFlagCode("gb-sct")).toBe("gb-sct");
  });

  it("falls back to the parent country for an unsupported subdivision", () => {
    expect(resolveFlagCode("fr-75")).toBe("fr");
  });

  it("falls back to the parent country for a malformed subdivision suffix", () => {
    expect(resolveFlagCode("gb-foobar")).toBe("gb");
  });

  it("returns undefined when neither the code nor its parent exist", () => {
    expect(resolveFlagCode("zz-foobar")).toBeUndefined();
  });

  it("returns undefined for an empty code", () => {
    expect(resolveFlagCode("")).toBeUndefined();
  });
});
