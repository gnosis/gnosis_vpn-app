import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import StatusHeader from "../../components/status/StatusHeader.tsx";
import Navigation from "../../components/Navigation.tsx";
import DestinationHero from "../../components/exitNode/DestinationHero.tsx";
import type { PickerFrame } from "../../components/exitNode/LocationPicker.tsx";
import StatusCard from "../../components/status/StatusCard.tsx";
import ConnectingExplainer from "../../components/status/ConnectingExplainer.tsx";
import { effectiveActive } from "../../stores/destinationMode.ts";
import ConnectButton from "../../components/ConnectButton.tsx";
import { createMainShortcuts } from "./mainShortcuts.ts";
import {
  back,
  currentPage,
  type PageId,
  push,
} from "../../stores/pageStack.ts";
import Page from "../../components/common/Page.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import SoftwareUpdatePage from "./pages/SoftwareUpdatePage.tsx";
import AboutPage from "./pages/AboutPage.tsx";
import AddFundsPage from "./pages/AddFundsPage.tsx";
import { isRunningRunMode } from "../../services/vpnService.ts";
import { deriveOverallStatus, type StatusText } from "../../utils/funding.ts";
import {
  channelMaintenanceWarning,
  isSwitchingDestination,
} from "../../utils/status.ts";
import { endOfLifeMessage } from "../../utils/updateAvailability.ts";
import { createDeadlineClock } from "../../utils/deadlineClock.ts";
import Banner from "../../components/common/Banner.tsx";
import UpdateIcon from "../../components/icons/UpdateIcon.tsx";
import WarningIcon from "../../components/icons/WarningIcon.tsx";

// Module scope — survives screen switches, resets on app restart.
const [dismissedBalanceStatus, setDismissedBalanceStatus] = createSignal<
  StatusText | null
>(null);

export function MainScreen() {
  const [appState] = useAppStore();
  const [, settingsActions] = useSettingsStore();

  const runModeStatus = createMemo(() =>
    isRunningRunMode(appState.runMode)
      ? appState.runMode.Running.funding_status
      : null
  );
  const balanceStatus = createMemo(() =>
    deriveOverallStatus(appState.balance, runModeStatus())
  );
  // Reset dismissal when balance recovers so the next drop resurfaces the banner.
  createEffect(() => {
    if (balanceStatus() === "Sufficient") setDismissedBalanceStatus(null);
  });
  // Dismissal is per status level so an escalation (Low → Empty) also resurfaces the banner.
  const showBalanceBanner = () =>
    balanceStatus() !== "Sufficient" &&
    dismissedBalanceStatus() !== balanceStatus();
  const balanceBannerText = () =>
    balanceStatus() === "Empty"
      ? "Your balance is empty"
      : "Your balance is low";

  // The outage age has to tick between status updates.
  const [nowMs, setNowMs] = createSignal(Date.now());
  const tick = setInterval(() => setNowMs(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));
  const maintenanceWarning = () =>
    channelMaintenanceWarning(appState.runMode, nowMs());

  const activeDestinationState = createMemo(() => {
    const id = effectiveActive(appState.mode, Date.now());
    return id ? appState.destinations[id] : undefined;
  });
  // The hero registers how to open the picker; Cmd/Ctrl+L goes through it.
  let openPicker: () => void = () => {};
  createMainShortcuts({ openPicker: () => openPicker() });

  // The picker spans the content column (the status card's width) and stops above the primary button.
  let columnRef: HTMLElement | undefined;
  let buttonRef: HTMLDivElement | undefined;
  const pickerFrame = (): PickerFrame | null => {
    if (!columnRef || !buttonRef) return null;
    const column = columnRef.getBoundingClientRect();
    return {
      left: column.left,
      width: column.width,
      maxBottom: buttonRef.getBoundingClientRect().top,
    };
  };

  // While a connect is in flight the explainer takes the status card's place.
  const connectInFlight = () => {
    const status = appState.vpnStatus;
    return status === "Connecting" || status === "Reconnecting" ||
      isSwitchingDestination(status, appState.targetDestination);
  };

  const mainContent = () => (
    <div class="flex w-full flex-col h-full py-6 px-4">
      <div class="flex flex-row justify-between z-60">
        <StatusHeader />
        <Navigation pickerFrame={pickerFrame} />
      </div>

      <div class="relative h-0 z-50">
        <div class="absolute top-2 left-0 right-0 flex flex-col gap-2">
          {/* No onDismiss: an end of life cannot be waved away. */}
          <Show when={appState.endOfLife}>
            {(endOfLife) => {
              const now = createDeadlineClock(() =>
                Date.parse(endOfLife().ends_at)
              );
              return (
                <Banner
                  variant="danger"
                  icon={<WarningIcon />}
                  onClick={() => push("software-update")}
                >
                  {endOfLifeMessage(endOfLife(), now())}
                </Banner>
              );
            }}
          </Show>
          <Show when={appState.isUpdateAvailable && !appState.endOfLife}>
            <Banner
              variant="update"
              icon={<UpdateIcon />}
              onClick={() => push("software-update")}
              onDismiss={() =>
                void settingsActions.setDismissedUpdateVersion(
                  appState.availableVersion,
                )}
              dismissAriaLabel="Dismiss update notification"
            >
              Update available
            </Banner>
          </Show>
          <Show when={showBalanceBanner()}>
            <Banner
              icon={<WarningIcon filled />}
              variant="warning"
              onDismiss={() => setDismissedBalanceStatus(balanceStatus())}
              dismissAriaLabel="Dismiss balance notification"
              onClick={() => push("add-funds")}
            >
              {balanceBannerText()}
            </Banner>
          </Show>
          {/* No dismiss or click: there is no user action, and it clears once the daemon recovers. */}
          <Show when={maintenanceWarning()}>
            {(warning) => (
              <Banner icon={<WarningIcon filled />} variant="warning">
                {warning()}
              </Banner>
            )}
          </Show>
        </div>
      </div>

      <main
        ref={(el) => (columnRef = el)}
        class="flex w-full flex-1 flex-col items-center min-h-0 gap-5 pt-6"
      >
        <DestinationHero
          registerOpenPicker={(open) => (openPicker = open)}
          pickerFrame={pickerFrame}
        />
        <Show when={activeDestinationState()}>
          {(ds) => (
            // Both share one grid cell so the swap cross-fades in place.
            <div class="grid w-full">
              {/* inert: the faded card must not keep a Tab stop while the explainer covers it */}
              <div
                ref={(el) =>
                  createEffect(() =>
                    el.toggleAttribute("inert", connectInFlight())
                  )}
                class="col-start-1 row-start-1 transition-opacity duration-300"
                classList={{
                  "opacity-0 pointer-events-none": connectInFlight(),
                }}
                aria-hidden={connectInFlight()}
              >
                <StatusCard destinationState={ds()} />
              </div>
              <Show when={connectInFlight()}>
                <div class="col-start-1 row-start-1 transition-opacity duration-300 starting:opacity-0">
                  <ConnectingExplainer destinationState={ds()} />
                </div>
              </Show>
            </div>
          )}
        </Show>
      </main>
      <div ref={(el) => (buttonRef = el)} class="mt-4 w-full z-10">
        <ConnectButton />
      </div>
    </div>
  );

  const pageTitle: Record<PageId, string> = {
    settings: "Settings",
    "software-update": "Software update",
    about: "About Gnosis VPN",
    "add-funds": "Add funds",
  };

  return (
    <Show when={currentPage()} keyed fallback={mainContent()}>
      {(page) => (
        <Page title={pageTitle[page]} onBack={() => back()}>
          <Switch>
            <Match when={page === "settings"}>
              <SettingsPage />
            </Match>
            <Match when={page === "software-update"}>
              <SoftwareUpdatePage />
            </Match>
            <Match when={page === "about"}>
              <AboutPage />
            </Match>
            <Match when={page === "add-funds"}>
              <AddFundsPage />
            </Match>
          </Switch>
        </Page>
      )}
    </Show>
  );
}

export default MainScreen;
