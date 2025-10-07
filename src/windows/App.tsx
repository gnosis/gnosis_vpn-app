import { MainScreen } from "@src/screens/MainScreen.tsx";
import { Dynamic } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import { onCleanup, onMount } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Onboarding from "@src/screens/Onboarding.tsx";
import { listen } from "@tauri-apps/api/event";

const screens = { main: MainScreen, onboarding: Onboarding } as const;

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

      const validScreens = ["main", "onboarding"] as const;
      type ValidScreen = (typeof validScreens)[number];
      const isValidScreen = (s: string): s is ValidScreen =>
        (validScreens as readonly string[]).includes(s);
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
