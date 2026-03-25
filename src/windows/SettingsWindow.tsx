import { createSignal, onCleanup, onMount } from "solid-js";
import { getVersion } from "@tauri-apps/api/app";
import { emit, listen } from "@tauri-apps/api/event";
import Settings from "../screens/settings/Settings.tsx";
import Usage from "../screens/settings/Usage.tsx";
import Logs from "../screens/settings/Logs.tsx";
import Tabs from "@src/components/common/Tabs.tsx";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { useAppStore } from "@src/stores/appStore.ts";

type GlobalTab = "settings" | "usage" | "logs";

export default function SettingsWindow() {
  const [tab, setTab] = createSignal<GlobalTab>("settings");
  let unlistenNavigate: (() => void) | undefined;
  const [, settingsActions] = useSettingsStore();
  const [, appActions] = useAppStore();
  let disposed = false;

  onMount(() => {
    void (async () => {
        const appVersion = await getVersion();
      const unlisten = await listen<string>("navigate", (event) => {
        const next = event.payload;
        if (next === "settings" || next === "usage" || next === "logs") {
          setTab(next);
        }
      });
      if (disposed) unlisten();
      else unlistenNavigate = unlisten;

      // NOTE: tauri apps use separate JS contexts between windows,
      // so this one needs to populate its own app state
      await Promise.all([appActions.initializeApp(appVersion), settingsActions.load()]);
      void emit("logs:request-snapshot");
    })();
  });

  onCleanup(() => {
    disposed = true;
    unlistenNavigate?.();
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
