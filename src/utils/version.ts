import type { UpdateChannel } from "@src/stores/settingsStore.ts";

// Mirrors `channel_of_version` in the toolkit: match the `experimental`
// segment, not the separator, since the pipeline slugs `+` to `-`.
export function detectChannel(version: string): UpdateChannel {
  if (version.split(/[.\-+]/).includes("experimental")) return "experimental";
  return version.includes("-") || version.includes("+") ? "snapshot" : "stable";
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    // `build.N` follows `+`, or `-` where the pipeline slugs it; other suffixes
    // (`-rc.1`, `+commit.abc1234`) carry no ordinal, so they stay unranked.
    const build = Number(v.match(/[-+]build\.(\d+)/)?.[1] ?? -1);
    const nums = v.split(/[-+]/)[0].split(".").map(Number);
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
