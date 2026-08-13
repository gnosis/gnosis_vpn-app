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
import { StatusIndicator } from "../../components/status/StatusIndicator.tsx";
import Navigation from "../../components/Navigation.tsx";
import LocationBanner from "../../components/exitNode/LocationBanner.tsx";
import ConnectButton from "../../components/ConnectButton.tsx";
import StatusHero from "../../components/status/StatusHero.tsx";
import StatusLine from "../../components/status/StatusLine.tsx";
import ConnectionStatus from "../../components/status/ConnectionStatus.tsx";
import { openSettingsWindow } from "../../utils/settingsWindow.ts";
import { isRunningRunMode } from "../../services/vpnService.ts";
import { deriveOverallStatus, type StatusText } from "../../utils/funding.ts";
import Banner from "../../components/common/Banner.tsx";
import UpdateIcon from "../../components/icons/UpdateIcon.tsx";
import WarningIcon from "../../components/icons/WarningIcon.tsx";
import { currentDisplayId } from "../../stores/destinationMode.ts";
import { destinationLabel } from "../../utils/destinations.ts";

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

  // TEMP(dev): see the "DEBUG: trigger slide" button below — surfaces which
  // destination the model actually considers active/displayed, since that
  // can differ from whichever card the carousel is currently previewing.
  const activeCardLabel = () => {
    const id = currentDisplayId(appState.mode);
    if (!id) return "(none)";
    const destination = appState.destinations[id]?.destination;
    return destination ? destinationLabel(destination) : id;
  };

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
        {
          /* -mx-4 cancels the screen's own px-4 so the carousel's edge-peek
            (LocationBanner.tsx) can bleed all the way to the true window
            border instead of stopping at the page margin. */
        }
        <div
          ref={exitAnchorRef}
          class="-mx-4 self-stretch flex justify-center z-10"
        >
          <LocationBanner />
        </div>
        <StatusLine heightPx={connectorHeight()} bottomPx={connectorBottom()} />
      </main>
      {
        /* TEMP(dev): re-triggers LocationBanner's slide on demand for
          animation iteration — remove once the slider rework lands. */
      }
      <div class="mb-1 w-full text-center text-xs font-bold text-fuchsia-300">
        DEBUG active card: {activeCardLabel()}
      </div>
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
