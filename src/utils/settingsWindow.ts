import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type SettingsTab = "settings" | "usage" | "logs" | "updates";

export async function openSettingsWindow(target?: SettingsTab) {
  const settingsWin = await WebviewWindow.getByLabel("settings");
  if (settingsWin) {
    await settingsWin.show();
    await settingsWin.setFocus();
    if (target) {
      await settingsWin.emit("navigate", target);
    }
  }
}
