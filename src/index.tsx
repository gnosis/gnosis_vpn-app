/* @refresh reload */
import "@src/index.css";
import { render } from "solid-js/web";
import App from "./windows/App.tsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { logError, logWarn } from "@src/utils/appLog.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { resolveTheme, type Theme, toTheme } from "@src/utils/theme.ts";

// Last-resort trail for errors nothing else caught (e.g. the async init IIFEs).
globalThis.addEventListener("error", (e) => {
  logError(`Uncaught error: ${e.message} (${e.filename}:${e.lineno})`);
});
globalThis.addEventListener("unhandledrejection", (e) => {
  logError(`Unhandled rejection: ${e.reason}`);
});
globalThis.addEventListener("contextmenu", (e) => e.preventDefault());
globalThis.addEventListener("dragstart", (e) => e.preventDefault());

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

(() => {
  const curWindow = getCurrentWindow();
  const root = document.getElementById("root") as HTMLElement;
  // Clear static loading content so Solid mounts as the only child (render() appends otherwise)
  root.innerHTML = "";

  render(() => {
    const [settings, settingsActions] = useSettingsStore();
    // The OS paths below only report; the user's Theme setting decides what is shown.
    const [osTheme, setOsTheme] = createSignal<Theme | null>(null);
    createEffect(() => {
      const os = osTheme();
      if (os !== null) applyTheme(resolveTheme(settings.theme, os));
    });

    onMount(() => {
      let disposed = false;
      let cleanup: (() => void) | undefined;

      const initTheme = async (): Promise<() => void> => {
        let mqCleanup: () => void = () => {};
        let unlistenTauri: () => void = () => {};
        let unlistenLinux: () => void = () => {};

        // index.html applies initial colors via a CSS media query.
        // Apply the backend theme to set the Tailwind .dark class consistently across all OS.
        // Waits for the settings too, so a Light/Dark pin never flashes the OS theme first.
        const settingsLoaded = settingsActions.load();
        let initial: Theme | null = null;
        try {
          initial = toTheme(await invoke<string>("get_initial_theme"));
        } catch (e) {
          logWarn(`[theme] initial theme fetch failed: ${e}`);
        }
        await settingsLoaded;
        if (initial !== null) setOsTheme(initial);

        // Each block is isolated so a failure in one does not skip the others.
        try {
          const mq = globalThis.matchMedia("(prefers-color-scheme: dark)");
          // matchMedia is always current, the backend's startup reading can be stale.
          setOsTheme(mq.matches ? "dark" : "light");
          const handleMediaChange = (e: MediaQueryListEvent) =>
            setOsTheme(e.matches ? "dark" : "light");
          mq.addEventListener("change", handleMediaChange);
          mqCleanup = () => mq.removeEventListener("change", handleMediaChange);
        } catch (e) {
          logWarn(`[theme] matchMedia setup failed: ${e}`);
        }

        // macOS: keep frontend in sync when Tauri reports a theme change.
        // Registering on Linux is a harmless no-op: onThemeChanged never fires there.
        try {
          unlistenTauri = await curWindow.onThemeChanged(
            ({ payload: theme }) => {
              setOsTheme(toTheme(theme));
            },
          );
        } catch (e) {
          logWarn(`[theme] onThemeChanged setup failed: ${e}`);
        }

        // Linux: backend emits "os-theme-changed" via XDG Desktop Portal / gsettings fallback.
        // All OS: also emitted on a switch back to Auto, since a pin masks the OS theme.
        try {
          unlistenLinux = await listen<string>(
            "os-theme-changed",
            ({ payload: theme }) => {
              setOsTheme(toTheme(theme));
            },
          );
        } catch (e) {
          logWarn(`[theme] os-theme-changed listener setup failed: ${e}`);
        }

        return () => {
          mqCleanup();
          unlistenTauri();
          unlistenLinux();
        };
      };

      // initTheme never rejects: each of the 4 async operations has its own try/catch,
      // so no rejection propagates. The .catch() is intentionally absent.
      initTheme().then((c) => {
        if (disposed) c();
        else cleanup = c;
      });

      onCleanup(() => {
        disposed = true;
        cleanup?.();
      });
    });

    return <App />;
  }, root);
})();
