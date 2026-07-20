import { invoke } from "@tauri-apps/api/core";

// The frontend has no runtime OS signal of its own; the `get_platform`
// command exposes Rust's std::env::consts::OS ("macos", "linux", …).
let cached: Promise<string> | undefined;

export function getPlatform(): Promise<string> {
  cached ??= invoke<string>("get_platform").catch(() => "unknown");
  return cached;
}
