/* @refresh reload */
import "@src/index.css";
import { render, Show } from "solid-js/web";
import App from "./windows/App.tsx";
import { useSettingsStore } from "./stores/settingsStore.ts";
import SettingsWindow from "./windows/SettingsWindow.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./stores/appStore.ts";
import { invoke } from "@tauri-apps/api/core";
import { createResource, onCleanup, onMount } from "solid-js";

function screenFromLabel(label: string) {
  if (label === "settings") {
    return <SettingsWindow />;
  }
  return <App />;
}

(() => {
  const root = document.getElementById("root") as HTMLElement;
  const [_settings, settingsActions] = useSettingsStore();
  const [,] = useAppStore();
  const [loadSettings] = createResource(settingsActions.load);
  const curWindow = getCurrentWindow();

  // cannot use Suspense here because screen has a hard requirements on settings being loaded
  render(
    () => {
      onMount(async () => {
        const theme = await curWindow.theme();
        invoke("theme_changed", { theme });

        const unlistenCb = await curWindow.onThemeChanged(
          ({ payload: theme }) => {
            console.log("theme", theme);
            invoke("theme_changed", { theme });
          },
        );

        onCleanup(() => {
          unlistenCb();
        });
      });

      return (
        <Show
          when={loadSettings.state === "ready"}
          // TODO needs better fallback or splash screen
          fallback={<div>Loading...</div>}
        >
          {screenFromLabel(curWindow.label)}
        </Show>
      );
    },
    root,
  );
})();
