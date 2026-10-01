import { describe, expect, it } from "vitest";
import { logBundleFileName, logDiscussionUrl } from "./logBundle.ts";

describe("logBundleFileName", () => {
  it("matches the uploader's filename pattern", () => {
    const name = logBundleFileName(new Date(2026, 0, 5, 7, 8, 9));
    expect(name).toBe("gnosis_vpn-20260105-070809.log.zst");
    expect(name).toMatch(/^gnosis_vpn-\d{8}-\d{6}\.log\.zst$/);
  });
});

describe("logDiscussionUrl", () => {
  const report = {
    description: "  VPN drops & reconnects\n",
    referenceId: "abc-123",
    packageVersion: "0.77.0",
    system: { os: "linux", arch: "x86_64", distribution: "Ubuntu 24.04.3 LTS" },
  };

  it("pre-fills the bug-report form fields", () => {
    const url = new URL(logDiscussionUrl(report));
    expect(url.origin + url.pathname).toBe(
      "https://github.com/gnosis/gnosis_vpn/discussions/new",
    );
    expect(url.searchParams.get("category")).toBe("issues-bug-reports");
    expect(url.searchParams.get("title")).toMatch(/^bug\(logs-from-app\): /);
    expect(url.searchParams.get("issue_description")).toBe(
      "VPN drops & reconnects",
    );
    expect(url.searchParams.get("steps_to_reproduce")).toBe(
      "Log reference ID: `abc-123`",
    );
    expect(url.searchParams.get("environment")).toBe(
      "Gnosis VPN package version: 0.77.0\nOS: linux (x86_64)\nDistribution: Ubuntu 24.04.3 LTS",
    );
  });

  it("drops unknown environment lines", () => {
    const url = new URL(
      logDiscussionUrl({
        ...report,
        packageVersion: null,
        system: { ...report.system, distribution: null },
      }),
    );
    expect(url.searchParams.get("environment")).toBe("OS: linux (x86_64)");
  });

  it("leaves the environment field out when nothing is known", () => {
    const url = new URL(
      logDiscussionUrl({ ...report, packageVersion: null, system: undefined }),
    );
    expect(url.searchParams.has("environment")).toBe(false);
  });
});
