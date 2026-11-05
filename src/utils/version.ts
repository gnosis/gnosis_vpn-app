import type { UpdateChannel } from "@src/stores/settingsStore.ts";

// Mirrors `channel_of_version` in the toolkit: match the `experimental`
// segment, not the separator, since the pipeline slugs `+` to `-`.
export function detectChannel(version: string): UpdateChannel {
  if (version.split(/[.\-+]/).includes("experimental")) return "experimental";
  return version.includes("-") || version.includes("+") ? "snapshot" : "stable";
}

export const CHANNEL_LABELS: Record<UpdateChannel, string> = {
  stable: "Stable",
  snapshot: "Snapshot",
  experimental: "Experimental",
};

/** The installed package is authoritative; the stored preference fills in until its version is known. */
export function effectiveChannel(
  packageVersion: string | null,
  preferred: UpdateChannel | null,
): UpdateChannel {
  return (packageVersion ? detectChannel(packageVersion) : null) ?? preferred ??
    "stable";
}
