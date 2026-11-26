import { describe, expect, it } from "vitest";
import { resolveTheme, toTheme } from "./theme.ts";

describe("resolveTheme", () => {
  it("follows the OS on auto", () => {
    expect(resolveTheme("auto", "light")).toBe("light");
    expect(resolveTheme("auto", "dark")).toBe("dark");
  });

  it("keeps a pin whatever the OS says", () => {
    expect(resolveTheme("light", "light")).toBe("light");
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("dark", "dark")).toBe("dark");
  });
});

describe("toTheme", () => {
  it("reads anything but light as dark", () => {
    expect(toTheme("light")).toBe("light");
    expect(toTheme("dark")).toBe("dark");
    expect(toTheme("")).toBe("dark");
  });
});
