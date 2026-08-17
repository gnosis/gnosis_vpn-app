import { createMemo } from "solid-js";
import Button from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import {
  currentDisplayId,
  resolveConnectTarget,
} from "../stores/backupDestinationMode.ts";
import { isReadyToConnect } from "../utils/exitHealth.ts";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();

  const isActive = createMemo(() =>
    appState.vpnStatus === "Connected" ||
    appState.vpnStatus === "Connecting" ||
    appState.vpnStatus === "Reconnecting"
  );
  const label = createMemo(() => (isActive() ? "Disconnect" : "Connect"));

  // Display-only — ignores an in-flight auto pending candidate, which is an
  // acceptable simplification here since it's not the actual connect target.
  const displayedId = createMemo(() => currentDisplayId(appState.mode));

  const targetDestinationState = createMemo(() => {
    const id = displayedId();
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
        // Resolved fresh at click time, not memoized — a memo only
        // recomputes when `mode` changes, not when wall-clock time crosses
        // an auto pending candidate's settleAt.
        const id = resolveConnectTarget(appState.mode, Date.now());
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
