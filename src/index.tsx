/* @refresh reload */
import "@src/index.css";
import { render } from "solid-js/web";
import App from "./windows/App.tsx";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import SettingsWindow from "./windows/SettingsWindow.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@src/stores/appStore.ts";

(() => {
  const [,] = useSettingsStore();
  const [,] = useAppStore();

  const label = getCurrentWindow().label;

  render(
    () => (label === "settings" ? <SettingsWindow /> : <App />),
    document.getElementById("root") as HTMLElement,
  );
})();
