import type { UpdateChannel } from "@src/stores/settingsStore.ts";

// Mirrors `channel_of_version` in the toolkit: match the `experimental`
// segment, not the separator, since the pipeline slugs `+` to `-`.
export function detectChannel(version: string): UpdateChannel {
  if (version.split(/[.\-+]/).includes("experimental")) return "experimental";
  return version.includes("-") || version.includes("+") ? "snapshot" : "stable";
}
