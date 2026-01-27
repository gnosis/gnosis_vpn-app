import { MainScreen } from "../screens/main/MainScreen.tsx";
import { Dynamic } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import { onCleanup, onMount } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Onboarding from "../screens/main/Onboarding.tsx";
import Synchronization from "../screens/main/Synchronization.tsx";
import { emit, listen } from "@tauri-apps/api/event";

const validScreens = ["main", "onboarding", "synchronization"] as const;
type ValidScreen = (typeof validScreens)[number];
type OnboardingStep = "start" | "airdrop" | "manually";
type NavigatePayload =
  | ValidScreen
  | {
    screen: ValidScreen;
    step?: OnboardingStep;
  };

const isValidScreen = (s: string): s is ValidScreen =>
  (validScreens as readonly string[]).includes(s);

function handleNavigate(
  payload: NavigatePayload,
  setScreen: (s: ValidScreen) => void,
): void {
  const screen = typeof payload === "string" ? payload : payload.screen;
  if (!isValidScreen(screen)) return;
  setScreen(screen);
  if (screen === "onboarding") {
    const step = typeof payload === "string" ? undefined : payload.step;
    if (step) void emit("onboarding:set-step", step);
  }
}

const screens = {
  main: MainScreen,
  onboarding: Onboarding,
  synchronization: Synchronization,
} as const;

function App() {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  let unlistenNavigate: (() => void) | undefined;

  onMount(() => {
    void (async () => {
      appActions.startStatusPolling(2000);
      await Promise.all([settingsActions.load(), appActions.refreshStatus()]);

      if (
        settings.connectOnStartup &&
        appState.vpnStatus === "Disconnected" &&
        appState.availableDestinations.length > 0
      ) {
        await appActions.connect();
      }

      unlistenNavigate = await listen<NavigatePayload>(
        "navigate",
        ({ payload }) =>
          handleNavigate(payload, (s) => appActions.setScreen(s)),
      );
    })();
  });

  onCleanup(() => {
    if (unlistenNavigate) unlistenNavigate();
    appActions.stopStatusPolling();
  });

  return (
    <div class="h-screen bg-bg-primary">
      <Dynamic component={screens[appState.currentScreen]} />
    </div>
  );
}

export default App;
