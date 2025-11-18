import { createMemo, Show } from "solid-js";
import Button from "@src/components/common/Button";
import { useAppStore } from "@src/stores/appStore";
import { useSettingsStore } from "@src/stores/settingsStore";
import { selectTargetAddress } from "@src/utils/destinations";
import NodeStatus from "@src/components/NodeStatus";
import { isReadyToConnect } from "@src/services/vpnService";

export default function ConnectButton() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();

  const isActive = createMemo(() =>
    appState.vpnStatus === "Connected" || appState.vpnStatus === "Connecting"
  );
  const label = createMemo(() => (isActive() ? "Stop" : "Connect"));

  const targetAddress = createMemo(() => {
    if (appState.selectedAddress) return appState.selectedAddress;
    if (appState.destination?.address) return appState.destination.address;
    const { address } = selectTargetAddress(
      undefined,
      settings.preferredLocation,
      appState.availableDestinations,
    );
    if (address) return address;
    return appState.destinations[0]?.destination.address;
  });

  const targetDestinationState = createMemo(() =>
    appState.destinations.find((ds) =>
      ds.destination.address === (targetAddress() ?? "")
    )
  );

  const targetHealth = createMemo(() =>
    targetDestinationState()?.health?.health
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
