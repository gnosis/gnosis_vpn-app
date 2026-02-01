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
  // initial theme and theme change listener
  const darkMedia = globalThis.matchMedia("(prefers-color-scheme: dark)");
  if (typeof darkMedia.addEventListener === "function") {
    darkMedia.addEventListener("change", handleThemeChange);
  } else {
    darkMedia.onchange = handleThemeChange;
  }
  applyTheme(darkMedia.matches);

  // initialize rendering
  const root = document.getElementById("root") as HTMLElement;
  const [_settings, settingsActions] = useSettingsStore();
  const [,] = useAppStore();
  const [loadSettings] = createResource(settingsActions.load);
  const curWindow = getCurrentWindow();

  // cannot use Suspense here because screen has a hard requirements on settings being loaded
  render(
    () => (
      <Show
        when={loadSettings.state === "ready"}
        // TODO needs better fallback or splash screen
        fallback={<div>Loading...</div>}
      >
        {screenFromLabel(curWindow.label)}
      </Show>
    ),
    root,
  );
})();
