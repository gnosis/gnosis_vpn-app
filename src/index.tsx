/* @refresh reload */
import "@src/index.css";
import { render, Show } from "solid-js/web";
import App from "./windows/App.tsx";
import { useSettingsStore } from "./stores/settingsStore.ts";
import SettingsWindow from "./windows/SettingsWindow.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./stores/appStore.ts";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createResource, onCleanup, onMount } from "solid-js";

function screenFromLabel(label: string) {
  if (label === "settings") {
    return <SettingsWindow />;
  }
  return <App />;
}

function applyTheme(theme: string) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  invoke("theme_changed", { theme });
}

(() => {
  const curWindow = getCurrentWindow();
  const root = document.getElementById("root") as HTMLElement;

  const [_settings, settingsActions] = useSettingsStore();
  const [,] = useAppStore();
  const [loadSettings] = createResource(settingsActions.load);

  render(() => {
    onMount(() => {
      let unlisten: (() => void) | undefined;

      const initTheme = async () => {
        // App windows dark/light: use backend initial theme (all OS), then follow OS changes
        const initial = await invoke<string | null>("get_initial_theme");
        if (initial) {
          applyTheme(initial);
        } else {
          const mediaQuery = matchMedia("(prefers-color-scheme: dark)");
          applyTheme(mediaQuery.matches ? "dark" : "light");
        }

        // macOS: Tauri emits theme changes; Linux: backend emits "os-theme-changed" via gsettings monitor
        const unlistenTauri = await curWindow.onThemeChanged(
          ({ payload: theme }) => {
            applyTheme(theme);
          },
        );
        const unlistenLinux = await listen<string>(
          "os-theme-changed",
          ({ payload: theme }) => {
            applyTheme(theme);
          },
        );

        unlisten = () => {
          unlistenTauri();
          unlistenLinux();
        };
      };
      initTheme();

      onCleanup(() => {
        if (unlisten) {
          unlisten();
        }
      });
    });

    // cannot use Suspense here because screen has a hard requirements on settings being loaded
    return (
      <Show
        when={loadSettings.state === "ready"}
        // TODO needs better fallback or splash screen
        fallback={<div>Loading...</div>}
      >
        {screenFromLabel(curWindow.label)}
      </Show>
    );
  }, root);
})();
