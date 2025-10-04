import { createMemo } from "solid-js";
import Button from "@src/components/common/Button";
import { useAppStore } from "@src/stores/appStore";
import { isConnected, isConnecting } from "@src/utils/status";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();

  const isActive = createMemo(() =>
    isConnected(appState.connectionStatus) ||
    isConnecting(appState.connectionStatus)
  );
  const label = createMemo(() => (isActive() ? "Stop" : "Connect"));

  const handleClick = async () => {
    try {
      if (isActive()) {
        await appActions.disconnect();
      } else {
        await appActions.connect();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to connect to VPN:", message);
    }
  };

  return (
    <div class="relative z-20 w-full">
      <Button
        size="lg"
        onClick={() => void handleClick()}
        disabled={appState.isLoading ||
          appState.connectionStatus === "ServiceUnavailable"}
      >
        {label()}
      </Button>
    </div>
  );
}
