import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { logWarn } from "@src/utils/appLog.ts";

// The frontend has no runtime OS signal of its own; the `get_platform`
// command exposes Rust's std::env::consts::OS ("macos", "linux", …).
let cached: Promise<string> | undefined;

export function getPlatform(): Promise<string> {
  cached ??= invoke<string>("get_platform").catch((e) => {
    logWarn(`get_platform failed, reporting "unknown": ${e}`);
    // A failure here can be transient; clear the cache so the next call
    // retries instead of pinning "unknown" forever.
    cached = undefined;
    return "unknown";
  });
  return cached;
}

export const SystemInfoSchema = z.object({
  os: z.string(),
  arch: z.string(),
  distribution: z.string().nullable(),
});
export type SystemInfo = z.infer<typeof SystemInfoSchema>;

/** Host OS, CPU architecture and OS release name; `undefined` when unavailable. */
export async function getSystemInfo(): Promise<SystemInfo | undefined> {
  try {
    return SystemInfoSchema.parse(await invoke<unknown>("get_system_info"));
  } catch (e) {
    logWarn(`get_system_info failed: ${e}`);
    return undefined;
  }
}
