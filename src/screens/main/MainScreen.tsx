import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import { StatusIndicator } from "../../components/StatusIndicator.tsx";
import Navigation from "../../components/Navigation.tsx";
import ExitNode from "../../components/ExitNode.tsx";
import ConnectButton from "../../components/ConnectButton.tsx";
import StatusHero from "../../components/StatusHero.tsx";
import StatusLine from "../../components/StatusLine.tsx";

export function MainScreen() {
  const [appState] = useAppStore();

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
        <StatusLine heightPx={connectorHeight()} />
        <div class="grow z-10"></div>
        <ConnectButton />
      </main>
    </div>
  );
}

export default MainScreen;
