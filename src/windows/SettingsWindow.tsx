import { createSignal, onCleanup, onMount } from "solid-js";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import Settings from "../screens/settings/Settings.tsx";
import Usage from "../screens/settings/Usage.tsx";
import Updates from "../screens/settings/Updates.tsx";
import Tabs from "@src/components/common/Tabs.tsx";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { logError, logWarn } from "@src/utils/appLog.ts";

type GlobalTab = "settings" | "usage" | "updates";

export default function SettingsWindow() {
  const [tab, setTab] = createSignal<GlobalTab>("settings");
  let unlistenNavigate: (() => void) | undefined;
  const [, settingsActions] = useSettingsStore();
  const [, appActions] = useAppStore();
  let disposed = false;

  onMount(() => {
    void (async () => {
      // Attach navigate listener first so we don't miss events emitted by
      // the tray/Navigation while store init is still pending.
      // window-scoped listen: a target-Any listener would also get emits aimed at the main window
      const unlisten = await getCurrentWebviewWindow().listen<string>(
        "navigate",
        (event) => {
          const next = event.payload;
          if (next === "settings" || next === "usage" || next === "updates") {
            setTab(next);
          } else {
            logWarn(`Ignoring navigate event with invalid tab: ${next}`);
          }
        },
      );
      if (disposed) unlisten();
      else unlistenNavigate = unlisten;

      // NOTE: tauri apps use separate JS contexts between windows,
      // so this one needs to populate its own app state
      await Promise.all([
        appActions.initializeApp(),
        settingsActions.load(),
      ]);
    })().catch((e) => logError(`Settings window initialization failed: ${e}`));
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
          { id: "updates", label: "Updates" },
        ]}
        activeId={tab()}
        onChange={(id) => setTab(id as GlobalTab)}
      />
      {tab() === "settings"
        ? <Settings />
        : tab() === "usage"
        ? <Usage />
        : <Updates />}
    </div>
  );
}
