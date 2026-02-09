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
  let unlisten: (() => void) | undefined;
  const [, settingsActions] = useSettingsStore();
  const [, appActions] = useAppStore();
  let startedPollingHere = false;

  onMount(() => {
    void (async () => {
      unlisten = await listen<string>("navigate", (event) => {
        const next = event.payload;
        if (next === "settings" || next === "usage" || next === "logs") {
          setTab(next);
        }
      });

      const mainWin = await WebviewWindow.getByLabel("main");
      const isMainVisible = mainWin ? await mainWin.isVisible() : false;
      if (!isMainVisible) {
        appActions.startStatusPolling();
        startedPollingHere = true;
        await Promise.all([settingsActions.load(), appActions.refreshStatus()]);
      } else {
        await Promise.all([settingsActions.load(), appActions.refreshStatus()]);
      }
      void emit("logs:request-snapshot");
    })();
  });

  onCleanup(() => {
    if (unlisten) unlisten();
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
