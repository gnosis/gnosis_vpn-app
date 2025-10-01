import "@src/App.css";
import { MainScreen } from "@src/screens/MainScreen.tsx";
import { Dynamic } from "solid-js/web";
import Logs from "@src/screens/Logs.tsx";
import Settings from "@src/screens/Settings.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import Usage from "@src/screens/Usage.tsx";
import { onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Onboarding from "@src/screens/Onboarding.tsx";

const screens = {
  main: MainScreen,
  logs: Logs,
  settings: Settings,
  usage: Usage,
  onboarding: Onboarding,
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

      const validScreens = ["main", "settings", "logs", "usage", "onboarding"] as const;
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
    <div class="h-screen bg-gray-100 dark:bg-gray-100">
      <Dynamic component={screens[appState.currentScreen]} />
    </div>
  );
}

export default App;
