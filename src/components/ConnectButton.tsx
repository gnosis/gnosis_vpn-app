import { createMemo } from "solid-js";
import Button from "@src/components/common/Button";
import { useAppStore } from "@src/stores/appStore";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();

  const isActive = createMemo(() =>
    appState.vpnStatus === "Connected" || appState.vpnStatus === "Connecting"
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
          appState.vpnStatus === "ServiceUnavailable"}
      >
        {label()}
      </Button>
    </div>
  );
}
