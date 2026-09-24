import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import {
  ChannelReleaseSchema,
  CheckOutcomeSchema,
  UpdateChannelSchema,
} from "@src/stores/settingsStore.ts";

// Wire types for the toolkit binary (`gnosis_vpn-update`), the source of truth
// for the package version and update checks. Fixtures: see toolkit.test.ts.

// Rejection strings the Rust side returns when the binary cannot be used. The
// Updates tab turns them into an explanation rather than an error.
export const TOOLKIT_MISSING = "ToolkitMissing";
export const TOOLKIT_TOO_OLD = "ToolkitTooOld";

export const ToolkitInfoSchema = z.object({
  // The updater's own version.
  version: z.string(),
  // The installed client package, read from /etc/gnosisvpn/version.txt; null
  // when that file is missing.
  package_version: z.string().nullable(),
});
export type ToolkitInfo = z.infer<typeof ToolkitInfoSchema>;

const UpdateManifestSchema = z.object({
  schema_version: z.number(),
  generated_at: z.string(),
  channels: z.object({
    stable: ChannelReleaseSchema.nullable(),
    snapshot: ChannelReleaseSchema.nullable(),
    // Absent until the channel has published once, so optional as well as nullable.
    experimental: ChannelReleaseSchema.nullable().optional(),
  }),
});

export const CheckResultSchema = z.object({
  // The channel that was checked: the one asked for, or the one the binary
  // inferred from the installed version.
  channel: UpdateChannelSchema,
  outcome: CheckOutcomeSchema,
  // Both channel entries exactly as fetched; null on outcomes that never got one.
  manifest: UpdateManifestSchema.nullable(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

// Rejects with "VpnNotConnected" (skipVpn maps to --force), TOOLKIT_MISSING /
// TOOLKIT_TOO_OLD, or the binary's own error text.
export async function checkUpdate(skipVpn: boolean): Promise<CheckResult> {
  const raw = await invoke<unknown>("check_update", { skipVpn });
  return CheckResultSchema.parse(raw);
}

// Rejects with TOOLKIT_MISSING / TOOLKIT_TOO_OLD.
export async function getToolkitInfo(): Promise<ToolkitInfo> {
  const raw = await invoke<unknown>("get_toolkit_version");
  return ToolkitInfoSchema.parse(raw);
}
