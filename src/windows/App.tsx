import { MainScreen } from "../screens/main/MainScreen.tsx";
import { Dynamic } from "solid-js/web";
import { AppScreen, AppState, useAppStore } from "@src/stores/appStore.ts";
import {
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Onboarding from "../screens/main/Onboarding.tsx";
import Synchronization from "../screens/main/Synchronization.tsx";
import Initialization from "../screens/main/Initialization.tsx";
import ServiceNotRunning from "../screens/main/ServiceNotRunning.tsx";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AUTO_CHECK_INTERVAL_MS,
  pendingCheckAfterConnect,
  runBackgroundCheck,
  setPendingCheckAfterConnect,
} from "@src/utils/updateChecker.ts";
import { isStaleOutcome } from "@src/utils/updateAvailability.ts";
import { logError, logInfo, logWarn } from "@src/utils/appLog.ts";
import TrafficPane from "@src/components/traffic/TrafficPane.tsx";
import { MAIN_COLUMN_ID } from "@src/utils/mainColumn.ts";
import {
  setTrafficPane,
  trafficPaneCollapsed,
  trafficPaneMounted,
  trafficPaneOpen,
} from "@src/utils/trafficPane.ts";

const validScreens = [
  "main",
  "onboarding",
  "synchronization",
  "initialization",
  "serviceNotRunning",
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
// Matches the screen wrapper's duration-300.
const SCREEN_FADE_MS = 300;

const isValidScreen = (s: string): s is ValidScreen =>
  (validScreens as readonly string[]).includes(s);

function handleNavigate(
  payload: NavigatePayload,
  setScreen: (s: ValidScreen) => void,
): void {
  const screen = typeof payload === "string" ? payload : payload.screen;
  if (!isValidScreen(screen)) {
    logWarn(`Ignoring navigate event with invalid screen: ${screen}`);
    return;
  }
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
        packageVersion: state.packageVersion,
        error: state.error,
        recoveryReason: state.syncRecoveryReason,
      };
    case "synchronization":
      return {
        syncProgress: state.syncProgress,
        recoveryReason: state.syncRecoveryReason,
      };
    case "main":
    case "onboarding":
    case "serviceNotRunning":
    default:
      return {};
  }
}

const screens = {
  initialization: Initialization,
  main: MainScreen,
  onboarding: Onboarding,
  synchronization: Synchronization,
  serviceNotRunning: ServiceNotRunning,
} as const;

function App() {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  let unlistenNavigate: (() => void) | undefined;
  let unlistenTraffic: (() => void)[] = [];
  let disposed = false;

  // Auto-update scheduling lives here so it stays active regardless of which tab is open.
  createEffect(() => {
    if (pendingCheckAfterConnect() && appState.vpnStatus === "Connected") {
      setPendingCheckAfterConnect(false);
      void runBackgroundCheck();
    }
  });

  createEffect(on(() => settings.updateCheck, (enabled) => {
    if (!enabled) {
      setPendingCheckAfterConnect(false);
      return;
    }
    if (appState.vpnStatus === "Connected") {
      void runBackgroundCheck();
    } else {
      setPendingCheckAfterConnect(true);
    }
  }, { defer: true }));

  // Once per installed version, so a verdict that never matches cannot loop.
  let recheckedVersion: string | null = null;
  createEffect(() => {
    // The pre-hydration defaults would make every launch look due.
    if (!settingsActions.hydrated() || !settings.updateCheck) return;
    const pkg = appState.packageVersion;
    const stale = pkg != null && pkg !== recheckedVersion &&
      isStaleOutcome(settings.lastCheckOutcome, pkg);
    // No verdict yet (fresh install, or settings from before they were kept) is due now.
    const delay =
      settings.lastCheckedAt == null || !settings.lastCheckOutcome || stale
        ? 0
        : Math.max(
          0,
          settings.lastCheckedAt + AUTO_CHECK_INTERVAL_MS - Date.now(),
        );
    const id = setTimeout(() => {
      if (stale) recheckedVersion = pkg;
      if (appState.vpnStatus === "Connected") {
        void runBackgroundCheck();
      } else {
        setPendingCheckAfterConnect(true);
      }
    }, delay);
    onCleanup(() => clearTimeout(id));
  });

  const [displayedScreen, setDisplayedScreen] = createSignal<ValidScreen>(
    appState.currentScreen as ValidScreen,
  );
  let lastChangeTime = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const [fadingOut, setFadingOut] = createSignal(false);
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;

  // Finished sync fades out before main fades in; other swaps stay instant.
  const showScreen = (nextScreen: ValidScreen) => {
    const isSyncDone = untrack(displayedScreen) === "synchronization" &&
      nextScreen === "main";
    if (!isSyncDone) {
      setDisplayedScreen(nextScreen);
      lastChangeTime = Date.now();
      return;
    }
    setFadingOut(true);
    fadeTimer = setTimeout(() => {
      setDisplayedScreen(nextScreen);
      setFadingOut(false);
      lastChangeTime = Date.now();
    }, SCREEN_FADE_MS);
  };

  createEffect(() => {
    // This effect tracks the store's currentScreen
    const nextScreen = appState.currentScreen as ValidScreen;

    // Clear any pending transition if the store requests a new screen quickly
    clearTimeout(timeoutId);
    timeoutId = undefined;
    clearTimeout(fadeTimer);
    setFadingOut(false);

    const now = Date.now();
    const elapsed = now - lastChangeTime;
    const minDelay = MIN_SCREEN_DISPLAY_TIME;

    if (elapsed >= minDelay) {
      // If it's been longer than minDelay, change immediately
      showScreen(nextScreen);
    } else {
      // Otherwise, wait for the remaining time to reach minDelay
      const remaining = minDelay - elapsed;
      timeoutId = setTimeout(() => showScreen(nextScreen), remaining);
    }
  });

  // The pane belongs to the main screen; the others have no top bar to close it from.
  createEffect(() => {
    if (displayedScreen() !== "main" && trafficPaneOpen()) {
      void setTrafficPane(false);
    }
  });

  onMount(() => {
    void (async () => {
      const current = getCurrentWebviewWindow();
      const listeners = await Promise.all([
        // From the tray entry, which has already brought the window up.
        current.listen("traffic:open", () => {
          if (untrack(displayedScreen) === "main") void setTrafficPane(true);
          else logInfo("traffic pane requested off the main screen, ignored");
        }),
        current.listen("traffic:closed", () => trafficPaneCollapsed()),
      ]);
      if (disposed) listeners.forEach((unlisten) => unlisten());
      else unlistenTraffic = listeners;
    })().catch((e) => logError(`Cannot follow traffic pane requests: ${e}`));

    void (async () => {
      await settingsActions.load();
      await appActions.initializeApp();

      // window-scoped listen: a target-Any listener would also get emits aimed at the settings window
      const unlisten = await getCurrentWebviewWindow().listen<NavigatePayload>(
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
    })().catch((e) => logError(`Main window initialization failed: ${e}`));
  });

  onCleanup(() => {
    disposed = true;
    unlistenNavigate?.();
    unlistenTraffic.forEach((unlisten) => unlisten());
    if (timeoutId) clearTimeout(timeoutId);
    clearTimeout(fadeTimer);
  });

  return (
    <div class="flex h-screen overflow-hidden bg-bg-primary">
      {/* Empty at the closed width; the window widens into it in one step and the glide is the pane's own. */}
      <div class="relative h-full min-w-0 flex-1 overflow-hidden">
        <Show when={trafficPaneMounted()}>
          {/* duration-250 is PANE_FADE_OUT_MS. */}
          <div
            class={`absolute inset-y-0 right-0 w-[460px] border-r border-border transition-[opacity,translate] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
              trafficPaneOpen()
                ? "translate-x-0 opacity-100 delay-150 duration-380 starting:translate-x-6 starting:opacity-0"
                : "translate-x-6 opacity-0 duration-250"
            }`}
          >
            <TrafficPane />
          </div>
        </Show>
      </div>
      {/* Always the closed width, so no resize timing can stretch the main screen; layout containment keeps `fixed` overlays inside it. */}
      <div
        id={MAIN_COLUMN_ID}
        class="relative h-full w-[360px] shrink-0 [contain:layout]"
      >
        <div
          class={`h-full transition-opacity duration-300 ${
            fadingOut() ? "opacity-0" : "opacity-100"
          }`}
        >
          <Dynamic
            component={screens[displayedScreen()]}
            {...mapStoreToScreenProps(
              displayedScreen(),
              appState,
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
