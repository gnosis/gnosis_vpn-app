import {
  createEffect,
  createMemo,
  createSignal,
  Show,
} from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import { StatusIndicator } from "../../components/status/StatusIndicator.tsx";
import Navigation from "../../components/Navigation.tsx";
import LocationBanner from "../../components/exitNode/LocationBanner.tsx";
import ConnectButton from "../../components/ConnectButton.tsx";
import StatusHero from "../../components/status/StatusHero.tsx";
import ConnectionStatus from "../../components/status/ConnectionStatus.tsx";
import { openSettingsWindow } from "../../utils/settingsWindow.ts";
import { isRunningRunMode } from "../../services/vpnService.ts";
import { deriveOverallStatus, type StatusText } from "../../utils/funding.ts";
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

  return (
    <div class="flex w-full flex-col h-full py-6 px-4">
      <div class="flex flex-row justify-between z-60">
        <StatusIndicator />
        <Navigation />
      </div>

      <div class="relative h-0 z-50">
        <div class="absolute top-2 left-0 right-0 flex flex-col gap-2">
          <Show when={appState.isUpdateAvailable}>
            <Banner
              variant="update"
              icon={<UpdateIcon />}
              onClick={() => openSettingsWindow("updates")}
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
              onClick={() => openSettingsWindow("usage")}
            >
              {balanceBannerText()}
            </Banner>
          </Show>
        </div>
      </div>

      <main class="flex w-full flex-1 flex-col items-center relative min-h-0">
        <StatusHero />
        {
          /* -mx-4 cancels the screen's own px-4 so the carousel's edge-peek
            (LocationBanner.tsx) can bleed all the way to the true window
            border instead of stopping at the page margin. */
        }
        <div class="-mx-4 self-stretch flex justify-center z-10">
          <LocationBanner />
        </div>
      </main>
      <div class="mt-4 w-full z-10">
        <ConnectButton />
      </div>
      <ConnectionStatus />
    </div>
  );
}

export default MainScreen;
