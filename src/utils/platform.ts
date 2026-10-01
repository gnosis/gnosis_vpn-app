import { invoke } from "@tauri-apps/api/core";
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

/** CPU architecture from Rust's std::env::consts::ARCH ("x86_64", "aarch64", …). */
export function getArch(): Promise<string> {
  return invoke<string>("get_arch").catch((e) => {
    logWarn(`get_arch failed, reporting "unknown": ${e}`);
    return "unknown";
  });
}

/** OS release name ("Ubuntu 24.04.3 LTS", "macOS 15.2"), or null when unknown. */
export function getOsDistribution(): Promise<string | null> {
  return invoke<string | null>("get_os_distribution").catch((e) => {
    logWarn(`get_os_distribution failed: ${e}`);
    return null;
  });
}
