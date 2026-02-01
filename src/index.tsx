/* @refresh reload */
import "@src/index.css";
import { render, Show } from "solid-js/web";
import App from "./windows/App.tsx";
import { useSettingsStore } from "./stores/settingsStore.ts";
import SettingsWindow from "./windows/SettingsWindow.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./stores/appStore.ts";
import { invoke } from "@tauri-apps/api/core";
import { createResource } from "solid-js";

function applyTheme(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function screenFromLabel(label: string) {
  if (label === "settings") {
    return <SettingsWindow />;
  }
  return <App />;
}

function handleThemeChange(event: MediaQueryListEvent) {
  const theme = event.matches ? "dark" : "light";
  invoke("theme_changed", { theme });
}

(() => {
  const curWindow = getCurrentWindow();

  // initial theme and theme change listener
  const darkMedia = globalThis.matchMedia("(prefers-color-scheme: dark)");
  if (typeof darkMedia.addEventListener === "function") {
    darkMedia.addEventListener("change", handleThemeChange);
  } else {
    darkMedia.onchange = handleThemeChange;
  }
  applyTheme(darkMedia.matches);

  const root = document.getElementById("root") as HTMLElement;

  // createEffect(() => {
  // applyTheme(settings.darkMode);
  // });

  render(() => {
    const [_settings, settingsActions] = useSettingsStore();
    const [,] = useAppStore();
    const [loadSettings] = createResource(settingsActions.load);

    // cannot use Suspense here because screen has a hard requirements on settings being loaded
    return (
      <Show when={loadSettings()} fallback={<div>Loading...</div>}>
        {screenFromLabel(curWindow.label)}
      </Show>
    );
  }, root);
})();
