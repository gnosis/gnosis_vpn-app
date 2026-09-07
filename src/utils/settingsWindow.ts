import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { logError, logInfo, logWarn } from "@src/utils/appLog.ts";

export type SettingsTab = "settings" | "usage" | "updates";

// try/catch because callers fire-and-forget this promise
export async function openSettingsWindow(target?: SettingsTab) {
  try {
    logInfo(`Opening settings window${target ? ` (${target} tab)` : ""}`);
    const settingsWin = await WebviewWindow.getByLabel("settings");
    if (!settingsWin) {
      logWarn("Settings window not found");
      return;
    }
    await settingsWin.show();
    await settingsWin.setFocus();
    if (target) {
      // emitTo: a broadcast would also hit the main window's navigate listener
      await settingsWin.emitTo("settings", "navigate", target);
    }
  } catch (e) {
    logError(`Failed to open settings window: ${e}`);
  }
}
