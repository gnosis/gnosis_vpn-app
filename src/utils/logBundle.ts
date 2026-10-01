const pad = (n: number): string => String(n).padStart(2, "0");

/** Local-time bundle name in the `gnosis_vpn-YYYYMMDD-HHMMSS.log.zst` form the log uploader requires. */
export function logBundleFileName(now: Date = new Date()): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${
    pad(now.getDate())
  }`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${
    pad(now.getSeconds())
  }`;
  return `gnosis_vpn-${date}-${time}.log.zst`;
}

/** New bug-report discussion URL on gnosis/gnosis_vpn, pre-filling the category form with the upload details. */
export function logDiscussionUrl(report: {
  description: string;
  referenceId: string;
  packageVersion: string | null;
  system: { os: string; arch: string; distribution: string | null } | undefined;
}): string {
  // Keys after `title` are the field ids of the category's discussion form.
  const params = new URLSearchParams({
    category: "issues-bug-reports",
    title: "bug(logs-from-app): Issue reported via in-app log upload",
    issue_description: report.description.trim(),
    steps_to_reproduce: `Log reference ID: \`${report.referenceId}\``,
  });
  const environment = [
    report.packageVersion &&
    `Gnosis VPN package version: ${report.packageVersion}`,
    report.system && `OS: ${report.system.os} (${report.system.arch})`,
    report.system?.distribution &&
    `Distribution: ${report.system.distribution}`,
  ].filter(Boolean).join("\n");
  if (environment) params.set("environment", environment);
  return `https://github.com/gnosis/gnosis_vpn/discussions/new?${params}`;
}
