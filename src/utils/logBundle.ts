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

/** New-issue URL on gnosis/gnosis_vpn, pre-filled with the user's description and the upload reference ID. */
export function logIssueUrl(description: string, referenceId: string): string {
  const body = [
    "## What went wrong",
    "",
    description.trim(),
    "",
    "## Log reference ID",
    "",
    `\`${referenceId}\``,
  ].join("\n");
  const params = new URLSearchParams({
    title: "bug(logs-from-app): Issue reported via in-app log upload",
    body,
  });
  return `https://github.com/gnosis/gnosis_vpn/issues/new?${params}`;
}
