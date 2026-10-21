import { invoke } from "@tauri-apps/api/core";
import { logError, logInfo } from "@src/utils/appLog.ts";

// try/catch because callers fire-and-forget this promise
export async function openTrafficWindow() {
  try {
    logInfo("Opening traffic window");
    // The backend shows and focuses the window, then tells it to start a fresh
    // session, so the tray and in-app entry points behave the same.
    await invoke("open_traffic_window");
  } catch (e) {
    logError(`Failed to open traffic window: ${e}`);
  }
}
