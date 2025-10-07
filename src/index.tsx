/* @refresh reload */
import "@src/index.css";
import { render } from "solid-js/web";
import App from "@src/windows/App";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import SettingsWindow from "@src/windows/SettingsWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

(async () => {
  const [, settingsActions] = useSettingsStore();
  await settingsActions.load();
  const label = getCurrentWindow().label;
  render(
    () => (label === "settings" ? <SettingsWindow /> : <App />),
    document.getElementById("root") as HTMLElement,
  );
})();
