import { createMemo } from "solid-js";
import Button from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { isConnected, isConnecting } from "../services/vpnService.ts";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();

  const isActive = createMemo(() => isConnected(appState.connectionStatus) || isConnecting(appState.connectionStatus));
  const label = createMemo(() => (isActive() ? "Stop" : "Connect"));
  const handleClick = async () => {
    if (isActive()) {
      await appActions.disconnect();
    } else {
      await appActions.connect();
    }
  };

  return (
    <div class="relative z-20 w-full">
      <Button
        size="lg"
        onClick={() => void handleClick()}
        disabled={appState.isLoading || appState.connectionStatus === "ServiceUnavailable"}
      >
        {label()}
      </Button>
    </div>
  );
}
