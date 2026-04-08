/* @refresh reload */
import "@src/index.css";
import { render } from "solid-js/web";
import App from "./windows/App.tsx";
import SettingsWindow from "./windows/SettingsWindow.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { onCleanup, onMount } from "solid-js";

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
}

(() => {
  const curWindow = getCurrentWindow();
  const root = document.getElementById("root") as HTMLElement;
  // Clear static loading content so Solid mounts as the only child (render() appends otherwise)
  root.innerHTML = "";

  render(() => {
    onMount(() => {
      let unlisten: (() => void) | undefined;

      const initTheme = async () => {
        // Sync initial class is already applied by the inline script in index.html via matchMedia.
        // Re-apply from backend to stay consistent with tray icon state (all OS).
        const initial = await invoke<string>("get_initial_theme");
        applyTheme(initial);

        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handleMediaChange = (e: MediaQueryListEvent) => {
          applyTheme(e.matches ? "dark" : "light");
        };
        mq.addEventListener("change", handleMediaChange);

        // macOS: Tauri also emits theme changes (kept for backend/tray awareness).
        // Linux: backend emits "os-theme-changed" via XDG Desktop Portal (ashpd) (kept for tray icon updates).
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
          mq.removeEventListener("change", handleMediaChange);
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

    return <>{screenFromLabel(curWindow.label)}</>;
  }, root);
})();
