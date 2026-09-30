import { describe, expect, it } from "vitest";
import { logBundleFileName } from "./logBundle.ts";

describe("logBundleFileName", () => {
  it("matches the uploader's filename pattern", () => {
    const name = logBundleFileName(new Date(2026, 0, 5, 7, 8, 9));
    expect(name).toBe("gnosis_vpn-20260105-070809.log.zst");
    expect(name).toMatch(/^gnosis_vpn-\d{8}-\d{6}\.log\.zst$/);
  });
});
