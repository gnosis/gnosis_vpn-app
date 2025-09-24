import "./App.css";
import { MainScreen } from "./screens/MainScreen.tsx";
import { Dynamic } from "solid-js/web";
import Logs from "./screens/Logs.tsx";
import Settings from "./screens/Settings.tsx";
import { useAppStore } from "./stores/appStore.ts";
import Usage from "./screens/Usage.tsx";
import { onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "./stores/settingsStore.ts";

const screens = {
  main: MainScreen,
  logs: Logs,
  settings: Settings,
  usage: Usage,
};

function App() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();
  let unlistenNavigate: (() => void) | undefined;

  onMount(() => {
    void (async () => {
      await appActions.refreshStatus();

      if (
        settings.connectOnStartup &&
        appState.connectionStatus === "Disconnected" &&
        appState.availableDestinations.length > 0
      ) {
        await appActions.connect();
      }

      appActions.startStatusPolling(2000);

      const validScreens = ["main", "settings", "logs", "usage"] as const;
      type ValidScreen = (typeof validScreens)[number];
      const isValidScreen = (s: string): s is ValidScreen => (validScreens as readonly string[]).includes(s);

      unlistenNavigate = await listen<string>("navigate", ({ payload }) => {
        if (isValidScreen(payload)) {
          appActions.setScreen(payload);
        }
      });
    })();
  });

  onCleanup(() => {
    appActions.stopStatusPolling();
    if (unlistenNavigate) unlistenNavigate();
  });

  return (
    <div class="h-screen bg-gray-100 dark:bg-gray-900">
      <Dynamic component={screens[appState.currentScreen]} />
    </div>
  );
}

export default App;
