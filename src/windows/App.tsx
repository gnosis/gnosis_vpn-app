import { MainScreen } from "../screens/main/MainScreen.tsx";
import { getVersion } from "@tauri-apps/api/app";
import { Dynamic } from "solid-js/web";
import { AppScreen, AppState, useAppStore } from "@src/stores/appStore.ts";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
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

const MIN_SCREEN_DISPLAY_TIME = 1333; // ms - ensure screens show for at least this long

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
        appVersion: state.appVersion,
        error: state.error,
      };
    case "synchronization":
      return {
        warmupStatus: state.warmupStatus,
        runMode: state.runMode,
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

  const [displayedScreen, setDisplayedScreen] = createSignal<ValidScreen>(
    appState.currentScreen as ValidScreen,
  );
  let lastChangeTime = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  createEffect(() => {
    // This effect tracks the store's currentScreen
    const nextScreen = appState.currentScreen as ValidScreen;

    // Clear any pending transition if the store requests a new screen quickly
    clearTimeout(timeoutId);
    timeoutId = undefined;

    const now = Date.now();
    const elapsed = now - lastChangeTime;
    const minDelay = MIN_SCREEN_DISPLAY_TIME;

    if (elapsed >= minDelay) {
      // If it's been longer than minDelay, change immediately
      setDisplayedScreen(nextScreen);
      lastChangeTime = Date.now();
    } else {
      // Otherwise, wait for the remaining time to reach minDelay
      const remaining = minDelay - elapsed;
      timeoutId = setTimeout(() => {
        setDisplayedScreen(nextScreen);
        lastChangeTime = Date.now();
      }, remaining);
    }
  });

  onMount(() => {
    void (async () => {
      const appVersion = await getVersion();
      await settingsActions.load();
      await appActions.initializeApp(appVersion);

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
    if (timeoutId) clearTimeout(timeoutId);
  });

  return (
    <div class="h-screen bg-bg-primary">
      {/* <Dynamic component={screens[displayedScreen()]} {...mapStoreToScreenProps(displayedScreen(), appState)} /> */}
      <Synchronization
        warmupStatus="Safe deployment ongoing"
        runMode={{ DeployingSafe: { node_address: "0x0" } }}
      />
    </div>
  );
}

export default App;
