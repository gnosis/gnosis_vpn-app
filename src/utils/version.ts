import type { UpdateChannel } from "@src/stores/settingsStore.ts";

export function detectChannel(version: string): UpdateChannel {
  return version.includes("-") || version.includes("+") ? "snapshot" : "stable";
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const withoutPre = v.split("-")[0];
    const [core, buildTag] = withoutPre.split("+");
    const nums = core.split(".").map(Number);
    const build = buildTag ? Number(buildTag.replace("build.", "")) : -1;
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
