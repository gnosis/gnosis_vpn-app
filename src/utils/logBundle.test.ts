import { describe, expect, it } from "vitest";
import { logBundleFileName, logIssueUrl } from "./logBundle.ts";

describe("logBundleFileName", () => {
  it("matches the uploader's filename pattern", () => {
    const name = logBundleFileName(new Date(2026, 0, 5, 7, 8, 9));
    expect(name).toBe("gnosis_vpn-20260105-070809.log.zst");
    expect(name).toMatch(/^gnosis_vpn-\d{8}-\d{6}\.log\.zst$/);
  });
});

describe("logIssueUrl", () => {
  it("pre-fills the title and a body with the description and reference ID", () => {
    const url = new URL(logIssueUrl("  VPN drops & reconnects\n", "abc-123"));
    expect(url.origin + url.pathname).toBe(
      "https://github.com/gnosis/gnosis_vpn/issues/new",
    );
    expect(url.searchParams.get("title")).toMatch(/^bug\(logs-from-app\): /);
    const body = url.searchParams.get("body")!;
    expect(body).not.toContain("@copilot");
    expect(body).toContain("\nVPN drops & reconnects\n");
    expect(body).toContain("`abc-123`");
  });
});
