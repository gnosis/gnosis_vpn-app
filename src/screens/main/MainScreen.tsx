import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { useAppStore } from "../../stores/appStore.ts";
import { effectiveActive } from "../../stores/destinationMode.ts";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import { StatusIndicator } from "../../components/status/StatusIndicator.tsx";
import Navigation from "../../components/Navigation.tsx";
import ConnectButton from "../../components/ConnectButton.tsx";
import ExitNodeList from "../../components/exitNode/ExitNodeList.tsx";
import LocationCard from "../../components/exitNode/LocationCard.tsx";
import LocationNotice from "../../components/exitNode/LocationNotice.tsx";
import { openSettings } from "../../utils/settingsPage.ts";
import { isRunningRunMode } from "../../services/vpnService.ts";
import { deriveOverallStatus, type StatusText } from "../../utils/funding.ts";
import { endOfLifeMessage } from "../../utils/updateAvailability.ts";
import { createDeadlineClock } from "../../utils/deadlineClock.ts";
import { channelMaintenanceWarning } from "../../utils/status.ts";
import Banner from "../../components/common/Banner.tsx";
import ListIcon from "../../components/icons/ListIcon.tsx";
import UpdateIcon from "../../components/icons/UpdateIcon.tsx";
import WarningIcon from "../../components/icons/WarningIcon.tsx";

// Module scope — survives screen switches, resets on app restart.
const [dismissedBalanceStatus, setDismissedBalanceStatus] = createSignal<
  StatusText | null
>(null);

export function MainScreen() {
  const [appState, appActions] = useAppStore();
  const [, settingsActions] = useSettingsStore();

  const runModeStatus = createMemo(() =>
    isRunningRunMode(appState.runMode) ? appState.runMode.funding_status : null
  );
  const balanceStatus = createMemo(() =>
    deriveOverallStatus(appState.balance, runModeStatus())
  );
  // Reset dismissal when balance recovers so the next drop resurfaces the banner.
  createEffect(() => {
    if (balanceStatus() === "Sufficient") setDismissedBalanceStatus(null);
  });
  // Somebody else's worker: nothing to pick, probe or connect; it recovers once they stop.
  const inUseByOtherUser = () => appState.vpnStatus === "InUseByOtherUser";

  // Dismissal is per status level so an escalation (Low → Empty) also resurfaces the banner.
  const showBalanceBanner = () =>
    !inUseByOtherUser() && // a non-owner sees no funds, even ones lingering from before the hand-over
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

  // The destination Connect targets; it vanishes with the status that drops it.
  const shownDestination = createMemo(() => {
    const id = effectiveActive(appState.mode, Date.now());
    return id ? appState.destinations[id] : undefined;
  });

  return (
    <div class="flex w-full flex-col h-full py-6 px-4">
      <div class="flex flex-row justify-between z-60">
        <StatusIndicator />
        <Navigation />
      </div>

      <main class="mt-3.5 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Show
          when={!inUseByOtherUser()}
          fallback={
            <LocationNotice title="In use by another user on this computer">
              Gnosis VPN is running for another user account. It becomes
              available here once that user disconnects and quits.
            </LocationNotice>
          }
        >
          <Show
            when={shownDestination()}
            fallback={
              <LocationNotice title="No exit nodes available">
                Checking for new ones…
              </LocationNotice>
            }
          >
            {(destinationState) => (
              <LocationCard destinationState={destinationState()} />
            )}
          </Show>
        </Show>
      </main>

      <div class="flex flex-none flex-col gap-2 pt-2.5 empty:hidden">
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
                onClick={() => openSettings("update")}
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
            onClick={() => openSettings("update")}
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
            onClick={() => openSettings("usage")}
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

      <Show when={!inUseByOtherUser()}>
        <div class="flex flex-none flex-col gap-2.5 pt-2.5">
          <button
            type="button"
            class="flex h-10.5 w-full cursor-pointer items-center justify-center gap-2.25 rounded-[9px] bg-bg-list text-[13px] font-bold shadow-[inset_0_0_0_1px_var(--color-control-ring)] hover:bg-control-bg"
            onClick={() => appActions.destinationListOpened()}
          >
            More locations
            <ListIcon class="h-3 w-4.75 text-control-tint" />
          </button>
          <ConnectButton />
        </div>
      </Show>

      <Portal>
        <Show when={appState.mode.listOpen}>
          <ExitNodeList
            onClose={(picked) => appActions.destinationListClosed(picked)}
          />
        </Show>
      </Portal>
    </div>
  );
}

export default MainScreen;
