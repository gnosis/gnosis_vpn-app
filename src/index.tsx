/* @refresh reload */
import "@src/index.css";
import { render } from "solid-js/web";
import App from "./windows/App.tsx";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import SettingsWindow from "./windows/SettingsWindow.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@src/stores/appStore.ts";
import { invoke } from "@tauri-apps/api/core";
import { createEffect } from "solid-js";

(() => {
  const [settings, settingsActions] = useSettingsStore();
  const [,] = useAppStore();

  const darkMedia = globalThis.matchMedia("(prefers-color-scheme: dark)");
  const emitThemeChanged = (isDark: boolean) => {
    void invoke("theme_changed", { theme: isDark ? "dark" : "light" });
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

  void settingsActions.load().then(() => {
    const label = getCurrentWindow().label;

    if (settings.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    createEffect(() => {
      if (settings.darkMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    });

    render(
      () => (label === "settings" ? <SettingsWindow /> : <App />),
      document.getElementById("root") as HTMLElement,
    );
  }).catch((e) => {
    console.error("Failed to load settings:", e);
  });
})();
