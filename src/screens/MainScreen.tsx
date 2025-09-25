import { Show, createSignal, onMount, onCleanup, createEffect } from "solid-js";
import Button from "../components/common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { StatusIndicator } from "../components/StatusIndicator.tsx";
import { isConnected, isConnecting } from "../services/vpnService.ts";
import Navigation from "../components/Navigation.tsx";
import ExitNode from "../components/ExitNode.tsx";

export function MainScreen() {
  const [appState, appActions] = useAppStore();

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
    window.addEventListener("resize", handler);
    onCleanup(() => window.removeEventListener("resize", handler));
  });

  createEffect(() => {
    void appState.connectionStatus;
    requestAnimationFrame(() => computeConnectorHeight());
  });

  async function handleConnect() {
    await appActions.connect();
  }

  async function handleDisconnect() {
    await appActions.disconnect();
  }

  return (
    <div class="flex w-full flex-col h-full py-6 px-4">
      <div class="flex flex-row justify-between">
        <StatusIndicator />
        <Navigation />
      </div>

      <main ref={mainRef} class="flex w-full flex-1 flex-col items-center relative">
        <div class="w-full h-1/4"></div>
        <div ref={exitAnchorRef} class="w-full flex justify-center z-10">
          <ExitNode />
        </div>
        <Show when={isConnecting(appState.connectionStatus)}>
          <div
            class={`vpn-connector-line -bottom-6 connecting`}
            style={{ height: `${connectorHeight()}px`, "pointer-events": "none" }}
          />
        </Show>
        <Show when={isConnected(appState.connectionStatus)}>
          <div
            class={`vpn-connector-line -bottom-6 connected`}
            style={{ height: `${connectorHeight()}px`, "pointer-events": "none" }}
          />
        </Show>
        <div class="flex-grow z-10"></div>
        <div class="relative z-20 w-full">
          <Show
            when={isConnected(appState.connectionStatus) || isConnecting(appState.connectionStatus)}
            fallback={
              <Button
                size="lg"
                onClick={() => handleConnect()}
                disabled={appState.isLoading || appState.connectionStatus === "ServiceUnavailable"}
              >
                Connect
              </Button>
            }
          >
            <Button
              size="lg"
              onClick={() => handleDisconnect()}
              disabled={appState.isLoading || appState.connectionStatus === "ServiceUnavailable"}
            >
              Stop
            </Button>
          </Show>
        </div>
      </main>
    </div>
  );
}

export default MainScreen;
