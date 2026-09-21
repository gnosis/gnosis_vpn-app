import type { UpdateChannel } from "@src/stores/settingsStore.ts";

// Mirrors `channel_of_version` in the toolkit: match the `experimental`
// segment, not the separator, since the pipeline slugs `+` to `-`.
export function detectChannel(version: string): UpdateChannel {
  if (version.split(/[.\-+]/).includes("experimental")) return "experimental";
  return version.includes("-") || version.includes("+") ? "snapshot" : "stable";
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const withoutPre = v.split("-")[0];
    const [core, buildTag] = withoutPre.split("+");
    const nums = core.split(".").map(Number);
    // `build.144124.experimental` must yield 144124, not NaN — an experimental
    // build otherwise never compares as newer than another same-day one.
    const buildDigits = buildTag?.match(/\d+/)?.[0];
    const build = buildDigits ? Number(buildDigits) : -1;
    return { nums, build };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return pa.build - pb.build;
}
