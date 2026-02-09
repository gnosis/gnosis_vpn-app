import { createMemo, Show } from "solid-js";
import Button from "./common/Button.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { useSettingsStore } from "../stores/settingsStore.ts";
import { selectTargetId } from "../utils/destinations.ts";
import NodeStatus from "./NodeStatus.tsx";
import { isReadyToConnect } from "../services/vpnService.ts";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();

  const isActive = createMemo(() =>
    appState.vpnStatus === "Connected" || appState.vpnStatus === "Connecting"
  );
  const label = createMemo(() => (isActive() ? "Stop" : "Connect"));

  const targetId = createMemo(() => {
    if (appState.selectedId) return appState.selectedId;
    if (appState.destination?.id) return appState.destination.id;
    const { id } = selectTargetId(
      undefined,
      settings.preferredLocation,
      appState.availableDestinations,
    );
    if (id) return id;
    return appState.destinations[0]?.destination.id;
  });

  const targetDestinationState = createMemo(() =>
    Object.values(appState.destinations).find((ds) =>
      ds.destination.id === (targetId() ?? "")
    )
  );

  const targetHealth = createMemo(() =>
    targetDestinationState()?.connectivity?.health
  );
  const isTargetReady = createMemo(() => isReadyToConnect(targetHealth()));

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
      <Show
        when={!isActive() && targetHealth() !== undefined && !isTargetReady()}
      >
        <div class="mt-2 text-center">
          <NodeStatus
            connectionState={targetDestinationState()?.connection_state}
            health={targetHealth()}
            warning
          />
        </div>
      </Show>
      <Button
        size="lg"
        onClick={() => void handleClick()}
        disabled={appState.isLoading ||
          appState.vpnStatus === "ServiceUnavailable" ||
          (!isActive() && !isTargetReady())}
      >
        {label()}
      </Button>
    </div>
  );
}
