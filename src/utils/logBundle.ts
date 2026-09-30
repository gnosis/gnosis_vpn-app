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
