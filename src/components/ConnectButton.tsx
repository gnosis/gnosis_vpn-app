import { createMemo } from "solid-js";
import Button from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { useBannerStore } from "../stores/bannerStore.ts";
import { isReadyToConnect } from "../utils/exitHealth.ts";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();
  const [bannerState] = useBannerStore();

  const isActive = createMemo(() =>
    appState.vpnStatus === "Connected" ||
    appState.vpnStatus === "Connecting" ||
    appState.vpnStatus === "Reconnecting"
  );
  const label = createMemo(() => (isActive() ? "Disconnect" : "Connect"));

  const targetId = createMemo(() => bannerState.activeId);

  const targetDestinationState = createMemo(() => {
    const id = targetId();
    return id ? appState.destinations[id] : undefined;
  });

  const isTargetReady = createMemo(() =>
    isReadyToConnect(targetDestinationState()?.route_health ?? undefined)
  );

  const handleClick = async () => {
    try {
      if (isActive()) {
        await appActions.disconnect();
      } else {
        const id = targetId();
        if (id) await appActions.connect(id);
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
        disabled={appState.isLoading || !(isActive() || isTargetReady())}
      >
        {label()}
      </Button>
    </div>
  );
}
