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
import { selectTargetId } from "../../utils/destinations.ts";

export function MainScreen() {
  const [appState] = useAppStore();
  const [settings] = useSettingsStore();

  const activeDestinationState = createMemo(() => {
    // Resolve the effective destination id (selected or random-fallback)
    const effectiveId = appState.selectedId ??
      appState.destination?.id ??
      selectTargetId(
        undefined,
        settings.preferredLocation,
        appState.availableDestinations,
      ).id;
    if (!effectiveId) return undefined;
    return appState.destinations[effectiveId];
  });

  let mainRef!: HTMLDivElement;
  let exitAnchorRef!: HTMLDivElement;
  const [connectorHeight, setConnectorHeight] = createSignal(0);

  const computeConnectorHeight = () => {
    if (!mainRef || !exitAnchorRef) return;
    const mainRect = mainRef.getBoundingClientRect();
    const exitRect = exitAnchorRef.getBoundingClientRect();
    const exitCenterY = exitRect.top + exitRect.height / 2;
    const heightPx = Math.max(0, Math.round(mainRect.bottom - exitCenterY));
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
    requestAnimationFrame(() => computeConnectorHeight());
  });

  return (
    <div class="flex w-full flex-col h-full py-6 px-4 select-none">
      <div class="flex flex-row justify-between z-60">
        <StatusIndicator />
        <Navigation />
      </div>

      <main
        ref={mainRef}
        class="flex w-full flex-1 flex-col items-center relative"
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
        <StatusLine heightPx={connectorHeight()} />
        <div class="grow z-10"></div>
        <ConnectButton />
      </main>
    </div>
  );
}

export default MainScreen;
