import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import { currentDisplayId } from "../../stores/destinationMode.ts";
import { StatusIndicator } from "../../components/status/StatusIndicator.tsx";
import Navigation from "../../components/Navigation.tsx";
import LocationBanner from "../../components/exitNode/LocationBanner.tsx";
import ConnectButton from "../../components/ConnectButton.tsx";
import StatusHero from "../../components/status/StatusHero.tsx";
import StatusLine from "../../components/status/StatusLine.tsx";
import ExitHealthDetail from "../../components/exitNode/ExitHealthDetail.tsx";
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
  const [appState, appActions] = useAppStore();
  const [, settingsActions] = useSettingsStore();

  const fundingIssues = createMemo(() =>
    isRunningRunMode(appState.runMode)
      ? (appState.runMode.Running.funding_issues ?? [])
      : []
  );
  const balanceStatus = createMemo(() => deriveOverallStatus(fundingIssues()));
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

  const activeDestinationState = createMemo(() => {
    const id = currentDisplayId(appState.mode);
    return id ? appState.destinations[id] : undefined;
  });

  let mainRef!: HTMLDivElement;
  let exitAnchorRef!: HTMLDivElement;
  const [connectorHeight, setConnectorHeight] = createSignal(0);
  const [connectorBottom, setConnectorBottom] = createSignal(0);

  const computeConnectorHeight = () => {
    if (!mainRef || !exitAnchorRef) return;
    const mainRect = mainRef.getBoundingClientRect();
    const exitRect = exitAnchorRef.getBoundingClientRect();
    const exitCenterY = exitRect.top + exitRect.height / 2;
    // Bar grows from the viewport bottom up to the exit node center,
    // passing behind the button and ConnectionStatus text.
    // bottomPx offsets the bar below main's bottom edge (positive when main
    // overflows the viewport, negative when it falls short).
    const bottomPx = Math.round(mainRect.bottom - globalThis.innerHeight);
    const heightPx = Math.max(
      0,
      Math.round(globalThis.innerHeight - exitCenterY),
    );
    setConnectorBottom(bottomPx);
    setConnectorHeight(heightPx);
  };

  onMount(() => {
    computeConnectorHeight();
    const handler = () => computeConnectorHeight();
    globalThis.addEventListener("resize", handler);
    onCleanup(() => globalThis.removeEventListener("resize", handler));
  });

  createEffect(() => {
    void appState.vpnStatus;
    const rafId = requestAnimationFrame(() => computeConnectorHeight());
    onCleanup(() => cancelAnimationFrame(rafId));
  });

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

      <main
        ref={mainRef}
        class="flex w-full flex-1 flex-col items-center relative min-h-0"
      >
        <StatusHero />
        <div class="w-full bg-slate-800 rounded-2xl p-1.5 z-10">
          <div ref={exitAnchorRef} class="w-full flex justify-center">
            <LocationBanner />
          </div>
          <Show when={activeDestinationState()}>
            {(ds) => (
              // mt-1.5 matches the card's own p-1.5 so this row sits as far
              // from the destination card as it does from the card's bottom
              // edge — evenly centered in the leftover space.
              <div class="w-full mt-1.5">
                <ExitHealthDetail destinationState={ds()} />
              </div>
            )}
          </Show>
        </div>
        <StatusLine heightPx={connectorHeight()} bottomPx={connectorBottom()} />
      </main>
      {
        /* TEMP(dev): re-triggers LocationBanner's slide on demand for
          animation iteration — remove once the slider rework lands. */
      }
      <button
        type="button"
        class="mb-2 w-full rounded-lg bg-fuchsia-600 py-1 text-xs font-bold text-white hover:cursor-pointer"
        onClick={() => appActions.debugAddFakeDestination()}
      >
        DEBUG: trigger slide
      </button>
      <div class="mt-4 w-full z-10">
        <ConnectButton />
      </div>
      <ConnectionStatus />
    </div>
  );
}

export default MainScreen;
