import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useAppStore } from "@src/stores/appStore";
import { StatusIndicator } from "@src/components/StatusIndicator";
import Navigation from "@src/components/Navigation";
import ExitNode from "@src/components/ExitNode";
import ConnectButton from "@src/components/ConnectButton";
import StatusHero from "@src/components/StatusHero";
import StatusLine from "@src/components/StatusLine";

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
    void appState.connectionStatus;
    requestAnimationFrame(() => computeConnectorHeight());
  });

  return (
    <div class="flex w-full flex-col h-full py-6 px-4">
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
        <div class="flex-grow z-10"></div>
        <ConnectButton />
      </main>
    </div>
  );
}

export default MainScreen;
