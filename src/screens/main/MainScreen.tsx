import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import StatusHeader from "../../components/status/StatusHeader.tsx";
import Navigation from "../../components/Navigation.tsx";
import DestinationHero from "../../components/exitNode/DestinationHero.tsx";
import ExitHealthDetail from "../../components/exitNode/ExitHealthDetail.tsx";
import { effectiveActive } from "../../stores/destinationMode.ts";
import ConnectButton from "../../components/ConnectButton.tsx";
import { openSettingsWindow } from "../../utils/settingsWindow.ts";
import { isRunningRunMode } from "../../services/vpnService.ts";
import { deriveOverallStatus, type StatusText } from "../../utils/funding.ts";
import { channelMaintenanceWarning } from "../../utils/status.ts";
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

  return (
    <div class="flex w-full flex-col h-full py-6 px-4">
      <div class="flex flex-row justify-between z-60">
        <StatusHeader />
        <Navigation />
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
                  onClick={() => openSettingsWindow("updates")}
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

      <main class="flex w-full flex-1 flex-col items-center min-h-0 gap-5 pt-6">
        <DestinationHero />
        {/* Interim: the status card replaces this panel in the next step. */}
        <Show when={activeDestinationState()}>
          {(ds) => (
            <div class="w-full rounded-xl bg-bg-surface px-3 py-2">
              <ExitHealthDetail destinationState={ds()} />
            </div>
          )}
        </Show>
      </main>
      <div class="mt-4 w-full z-10">
        <ConnectButton />
      </div>
    </div>
  );
}

export default MainScreen;
