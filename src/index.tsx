/* @refresh reload */
import "@src/index.css";
import { render } from "solid-js/web";
import App from "@src/windows/App";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import SettingsWindow from "@src/windows/SettingsWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@src/stores/appStore.ts";

(() => {
  const [, ] = useSettingsStore();
  const [, ] = useAppStore();

  const label = getCurrentWindow().label;

  render(
    () => (label === "settings" ? <SettingsWindow /> : <App />),
    document.getElementById("root") as HTMLElement,
  );
})();
