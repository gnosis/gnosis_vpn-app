/* @refresh reload */
import { render } from "solid-js/web";
import App from "@src/App.tsx";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import GlobalSettings from "@src/screens/GlobalSettings.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";

(async () => {
  const [, settingsActions] = useSettingsStore();
  await settingsActions.load();
  const label = getCurrentWindow().label;
  render(() => (label === "settings" ? <GlobalSettings /> : <App />), document.getElementById("root") as HTMLElement);
})();
