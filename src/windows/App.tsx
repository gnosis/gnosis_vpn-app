import { MainScreen } from "../screens/main/MainScreen.tsx";
import { Dynamic } from "solid-js/web";
import { AppScreen, AppState, useAppStore } from "@src/stores/appStore.ts";
import { onCleanup, onMount } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Onboarding from "../screens/main/Onboarding.tsx";
import Synchronization from "../screens/main/Synchronization.tsx";
import Initialization from "../screens/main/Initialization.tsx";
import { emit, listen } from "@tauri-apps/api/event";

const validScreens = [
  "main",
  "onboarding",
  "synchronization",
  "initialization",
] as const;
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

/**
 * Maps global store state to specific screen props.
 * This acts as the translation layer between the store and the UI components.
 */
function mapStoreToScreenProps(screen: ValidScreen, state: AppState) {
  switch (screen) {
    case "initialization":
      return {
        info: state.serviceInfo,
        error: state.error,
      };
    case "synchronization":
      return {
        warmupStatus: state.warmupStatus,
      };
    case "main":
    case "onboarding":
    default:
      return {};
  }
}

const screens = {
  initialization: Initialization,
  main: MainScreen,
  onboarding: Onboarding,
  synchronization: Synchronization,
} as const;

function App() {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  let unlistenNavigate: (() => void) | undefined;
  let disposed = false;

  onMount(() => {
    void (async () => {
      await settingsActions.load();
      await appActions.initializeApp();

      if (
        settings.connectOnStartup &&
        appState.vpnStatus === "Disconnected" &&
        appState.availableDestinations.length > 0
      ) {
        await appActions.connect();
      }

      const unlisten = await listen<NavigatePayload>(
        "navigate",
        ({ payload }) =>
          handleNavigate(payload, (s) => {
            const screen = s as AppScreen;
            if (screen) {
              appActions.setScreen(screen);
            }
          }),
      );
      if (disposed) unlisten();
      else unlistenNavigate = unlisten;
    })();
  });

  onCleanup(() => {
    disposed = true;
    unlistenNavigate?.();
    appActions.stopStatusPolling();
  });

  return (
    <div class="h-screen bg-bg-primary">
      <Dynamic
        component={screens[appState.currentScreen]}
        {...mapStoreToScreenProps(
          appState.currentScreen as ValidScreen,
          appState,
        )}
      />
    </div>
  );
}

export default App;
