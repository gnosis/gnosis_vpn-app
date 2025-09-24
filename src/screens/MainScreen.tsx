import { Show } from "solid-js";
import Button from "../components/common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { StatusIndicator } from "../components/StatusIndicator.tsx";
import { isConnected, isConnecting } from "../services/vpnService.ts";
import Navigation from "../components/Navigation.tsx";
import ExitNode from "../components/ExitNode.tsx";

export function MainScreen() {
  const [appState, appActions] = useAppStore();

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

      <main class="flex w-full flex-1 flex-col items-center">
        <div class="w-full h-1/4"></div>
        <ExitNode />
        <div class="flex-grow"></div>
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
      </main>
    </div>
  );
}

export default MainScreen;
