import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { logError } from "@src/utils/appLog.ts";

// Main-window-only, like updateChecker.ts: module signals don't cross webviews.
const [open, setOpen] = createSignal(false);

/** Whether the traffic window is up; Rust sends every change as `traffic:window`. */
export const trafficWindowOpen = open;
export const setTrafficWindowOpen = setOpen;

/** Opens the traffic window, brings it forward, or closes it if it was in front. */
export async function toggleTrafficWindow(): Promise<void> {
  try {
    await invoke("traffic_window_toggle");
  } catch (e) {
    logError(`Failed to toggle the traffic window: ${e}`);
  }
}
