import { createSignal, onCleanup, onMount } from "solid-js";
import { emit, listen } from "@tauri-apps/api/event";
import Settings from "../screens/settings/Settings.tsx";
import Usage from "../screens/settings/Usage.tsx";
import Logs from "../screens/settings/Logs.tsx";
import Tabs from "@src/components/common/Tabs.tsx";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

type GlobalTab = "settings" | "usage" | "logs";

export default function SettingsWindow() {
  const [tab, setTab] = createSignal<GlobalTab>("settings");
  let unlistenNavigate: (() => void) | undefined;
  const [, settingsActions] = useSettingsStore();
  const [, appActions] = useAppStore();
  let startedPollingHere = false;
  let disposed = false;

  onMount(() => {
    void (async () => {
      const unlisten = await listen<string>("navigate", (event) => {
        const next = event.payload;
        if (next === "settings" || next === "usage" || next === "logs") {
          setTab(next);
        }
      });
      if (disposed) unlisten();
      else unlistenNavigate = unlisten;

      const mainWin = await WebviewWindow.getByLabel("main");
      const isMainVisible = mainWin ? await mainWin.isVisible() : false;
      if (!isMainVisible) {
        await appActions.initializeApp();
        startedPollingHere = true;
      }
      await settingsActions.load();
      void emit("logs:request-snapshot");
    })();
  });

  onCleanup(() => {
    disposed = true;
    unlistenNavigate?.();
    if (startedPollingHere) appActions.stopStatusPolling();
  });

  return (
    <div class="system-window w-full h-screen flex flex-col items-center bg-bg-primary">
      <Tabs
        tabs={[
          { id: "settings", label: "Settings" },
          { id: "usage", label: "Usage" },
          { id: "logs", label: "Logs" },
        ]}
        activeId={tab()}
        onChange={(id) => setTab(id as GlobalTab)}
      />
      {tab() === "settings"
        ? <Settings />
        : tab() === "usage"
        ? <Usage />
        : <Logs />}
    </div>
  );
}
