import { For, Show } from 'solid-js';
import Button from '../components/common/Button';
import { useAppStore } from '../stores/appStore';
import type { Destination } from '../services/vpnService';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  isConnected,
  isConnectedTo,
  isConnecting,
  isConnectingTo,
  isServiceUnavailable,
} from '../services/vpnService';

export function MainScreen() {
  const [appState, appActions] = useAppStore();

  async function handleConnect(destination?: Destination) {
    await appActions.connect(destination?.address);
  }

  async function handleDisconnect() {
    await appActions.disconnect();
  }

  return (
    <div class="flex flex-col h-full p-6 gap-6">
      <StatusIndicator
        status={appState.connectionStatus}
        isLoading={appState.isLoading}
      />

      <Show when={!isServiceUnavailable(appState.connectionStatus)}>
        <div class="mt-4 flex-grow flex flex-col justify-center">
          <h3 class="text-lg font-semibold mb-2">Available Destinations</h3>
          <div class="space-y-2">
            <For each={appState.availableDestinations}>
              {dest => (
                <div class="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-800 p-3">
                  <div class="text-sm">
                    <div class="font-medium">
                      {dest.meta.city} {dest.meta.state} {dest.meta.location}
                    </div>
                    <Show when={Object.keys(dest.meta || {}).length}>
                      <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {dest.address}
                      </div>
                    </Show>
                  </div>
                  <div>
                    <Show
                      when={
                        isConnectedTo(appState.connectionStatus, dest) ||
                        isConnectingTo(appState.connectionStatus, dest)
                      }
                      fallback={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConnect(dest)}
                        >
                          {isConnected(appState.connectionStatus) ||
                          isConnecting(appState.connectionStatus)
                            ? 'Switch'
                            : 'Connect'}
                        </Button>
                      }
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect()}
                      >
                        Disconnect
                      </Button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default MainScreen;
