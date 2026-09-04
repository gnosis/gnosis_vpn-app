import { createMemo } from "solid-js";
import Button from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { effectiveActive } from "../stores/destinationMode.ts";
import { isReady } from "../utils/destinations.ts";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();

  const isActive = createMemo(() =>
    appState.vpnStatus === "Connected" ||
    appState.vpnStatus === "Connecting" ||
    appState.vpnStatus === "Reconnecting"
  );
  const label = createMemo(() => (isActive() ? "Disconnect" : "Connect"));

  const displayedId = createMemo(() =>
    effectiveActive(appState.mode, Date.now())
  );

  const targetDestinationState = createMemo(() => {
    const id = displayedId();
    return id ? appState.destinations[id] : undefined;
  });

  const isTargetReady = createMemo(() =>
    isReady(targetDestinationState(), null)
  );

  const handleClick = async () => {
    try {
      if (isActive()) {
        await appActions.disconnect();
      } else {
        // Resolved fresh at click time: a memo recomputes on `mode`, not on the clock crossing settleAt.
        const id = effectiveActive(appState.mode, Date.now());
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
