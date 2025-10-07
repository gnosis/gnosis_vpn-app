import { MainScreen } from "@src/screens/MainScreen.tsx";
import { Dynamic } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import { onCleanup, onMount } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Onboarding from "@src/screens/Onboarding.tsx";

const screens = { main: MainScreen, onboarding: Onboarding } as const;

function App() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();

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
    })();
  });

  onCleanup(() => {
    appActions.stopStatusPolling();
  });

  return (
    <div class="h-screen bg-gray-100 dark:bg-gray-100">
      <Dynamic component={screens[appState.currentScreen]} />
    </div>
  );
}

export default App;
