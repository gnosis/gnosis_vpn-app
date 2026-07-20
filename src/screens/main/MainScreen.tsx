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
import ExitNode from "../../components/exitNode/ExitNode.tsx";
import ConnectButton from "../../components/ConnectButton.tsx";
import StatusHero from "../../components/status/StatusHero.tsx";
import StatusLine from "../../components/status/StatusLine.tsx";
import ExitHealthDetail from "../../components/exitNode/ExitHealthDetail.tsx";
import { resolveAutoDestination } from "../../utils/destinations.ts";
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
  const [settings, settingsActions] = useSettingsStore();

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
    if (appState.selectedId) return appState.destinations[appState.selectedId];
    const resolved = resolveAutoDestination(
      appState.availableDestinations,
      appState.destinations,
      settings.preferredLocation,
    );
    return resolved ? appState.destinations[resolved.id] : undefined;
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
        <div ref={exitAnchorRef} class="w-full flex justify-center z-10">
          <ExitNode />
        </div>
        <Show when={activeDestinationState()}>
          {(ds) => (
            <div class="w-full z-10 mt-2">
              <ExitHealthDetail destinationState={ds()} />
            </div>
          )}
        </Show>
        <StatusLine heightPx={connectorHeight()} bottomPx={connectorBottom()} />
      </main>
      <div class="mt-4 w-full z-10">
        <ConnectButton />
      </div>
      <ConnectionStatus />
    </div>
  );
}

export default MainScreen;
