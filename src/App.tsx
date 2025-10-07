import "@src/App.css";
import { MainScreen } from "@src/screens/MainScreen.tsx";
import { Dynamic } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import { onCleanup, onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Onboarding from "@src/screens/Onboarding.tsx";

const screens = { main: MainScreen, onboarding: Onboarding } as const;

function App() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();
  let unlistenNavigate: (() => void) | undefined;

  onMount(() => {
    void (async () => {
      const currentWindow = getCurrentWindow();
      console.log("currentWindow", currentWindow);
      const currentLabel = currentWindow.label;

      if (currentLabel !== "settings") {
        // Main window behavior
        await appActions.refreshStatus();

        if (
          settings.connectOnStartup &&
          appState.connectionStatus === "Disconnected" &&
          appState.availableDestinations.length > 0
        ) {
          await appActions.connect();
        }

        appActions.startStatusPolling(2000);
      }

      // No navigate listener needed for main window now
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
