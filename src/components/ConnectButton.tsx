import { Show } from "solid-js";
import Button from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { isConnected, isConnecting } from "../services/vpnService.ts";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();

  async function handleConnect() {
    await appActions.connect();
  }

  async function handleDisconnect() {
    await appActions.disconnect();
  }

  return (
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
  );
}
