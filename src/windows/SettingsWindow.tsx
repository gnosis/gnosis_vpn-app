import { createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import Settings from "@src/screens/Settings.tsx";
import Usage from "@src/screens/Usage.tsx";
import Logs from "@src/screens/Logs.tsx";
import Tabs from "@src/components/common/Tabs.tsx";

type GlobalTab = "settings" | "usage" | "logs";

export default function SettingsWindow() {
  const [tab, setTab] = createSignal<GlobalTab>("settings");
  let unlisten: (() => void) | undefined;

  onMount(() => {
    void (async () => {
      unlisten = await listen<string>("navigate", event => {
        const next = event.payload;
        if (next === "settings" || next === "usage" || next === "logs") {
          setTab(next);
        }
      });
    })();
  });

  onCleanup(() => {
    if (unlisten) unlisten();
  });

  return (
    <div>
      <Tabs
        tabs={[
          { id: "settings", label: "Settings" },
          { id: "usage", label: "Usage" },
          { id: "logs", label: "Logs" },
        ]}
        activeId={tab()}
        onChange={id => setTab(id as GlobalTab)}
        class="mb-4"
      />
      {tab() === "settings" ? <Settings /> : tab() === "usage" ? <Usage /> : <Logs />}
    </div>
  );
}
