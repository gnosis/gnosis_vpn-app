/* @refresh reload */
import "@src/index.css";
import { render } from "solid-js/web";
import { onCleanup, onMount } from "solid-js";
import App from "@src/windows/App";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import SettingsWindow from "@src/windows/SettingsWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@src/stores/appStore.ts";
import { useNodeAnalyticsStore } from "@src/stores/nodeAnalyticsStore.ts";

(() => {
  const [, settingsActions] = useSettingsStore();
  const [, appActions] = useAppStore();
  const [, analyticsActions] = useNodeAnalyticsStore();

  const label = getCurrentWindow().label;

  onMount(() => {
    void (async () => {
      await appActions.refreshStatus();
      await settingsActions.load();
      await analyticsActions.load();
      appActions.startStatusPolling(2000);
    })();
  });

  onCleanup(() => {
    appActions.stopStatusPolling();
  });

  render(
    () => (label === "settings" ? <SettingsWindow /> : <App />),
    document.getElementById("root") as HTMLElement,
  );
})();
