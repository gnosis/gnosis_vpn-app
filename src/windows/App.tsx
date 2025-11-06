import { MainScreen } from "@src/screens/main/MainScreen";
import { Dynamic } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import { onCleanup, onMount } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Onboarding from "@src/screens/main/Onboarding";
import Synchronization from "@src/screens/main/Synchronization";
import { listen } from "@tauri-apps/api/event";

const screens = {
  main: MainScreen,
  onboarding: Onboarding,
  synchronization: Synchronization,
} as const;

function App() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();
  let unlistenNavigate: (() => void) | undefined;

  onMount(() => {
    void (async () => {
      if (
        settings.connectOnStartup &&
        appState.vpnStatus === "Disconnected" &&
        appState.availableDestinations.length > 0
      ) {
        await appActions.connect();
      }

      const validScreens = ["main", "onboarding", "synchronization"] as const;
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
    if (unlistenNavigate) unlistenNavigate();
  });

  return (
    <div class="h-screen bg-gray-100 dark:bg-gray-100">
      <Dynamic component={screens[appState.currentScreen]} />
    </div>
  );
}

export default App;
