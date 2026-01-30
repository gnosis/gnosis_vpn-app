/* @refresh reload */
import "@src/index.css";
import { render } from "solid-js/web";
import App from "./windows/App.tsx";
import { useSettingsStore } from "./stores/settingsStore.ts";
import SettingsWindow from "./windows/SettingsWindow.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./stores/appStore.ts";
import { invoke } from "@tauri-apps/api/core";
import { createEffect } from "solid-js";

async function whenTauriReady<T>(
  fn: () => Promise<T>,
  retries = 5,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise((r) => setTimeout(r, 100));
    return whenTauriReady(fn, retries - 1);
  }
}

(() => {
  const [settings, settingsActions] = useSettingsStore();
  const [,] = useAppStore();

  const root = document.getElementById("root") as HTMLElement;
  let label: string;
  try {
    label = getCurrentWindow().label;
  } catch {
    label = "main";
  }

  const applyTheme = (isDark: boolean) => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const defaultDark =
    globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(defaultDark);

  createEffect(() => {
    applyTheme(settings.darkMode);
  });

  render(() => (label === "settings" ? <SettingsWindow /> : <App />), root);

  queueMicrotask(() => {
    const darkMedia = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const emitThemeChanged = (isDark: boolean) => {
      void whenTauriReady(() =>
        invoke("theme_changed", { theme: isDark ? "dark" : "light" })
      );
    };
    const handleThemeChange = (event: MediaQueryListEvent) => {
      emitThemeChanged(event.matches);
    };

    emitThemeChanged(darkMedia.matches);
    if (typeof darkMedia.addEventListener === "function") {
      darkMedia.addEventListener("change", handleThemeChange);
    } else {
      darkMedia.onchange = handleThemeChange;
    }

    void whenTauriReady(() => settingsActions.load()).catch((e) => {
      console.error("Failed to load settings:", e);
    });
  });
})();
