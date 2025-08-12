import { For, Show, onMount } from 'solid-js';
import Button from '../components/common/Button';
import { createAppStore } from '../stores/appStore';
import { VPNService } from '../services';
import type { Destination } from '../types';
import { isConnected } from '../types';
import { StatusIndicator } from '../components/StatusIndicator';
import ActionButton from '../components/ActionButton';
import Navigation from '../components/Navigation';

export function MainScreen() {
  const [appState, appActions] = createAppStore();

  console.log(appState);

  async function handleConnect(destination?: Destination) {
    try {
      appActions.setLoading(true);
      if (destination) {
        await VPNService.connect(destination.address);
      } else {
        // Default to first available destination if provided
        const first = appState.availableDestinations[0];
        if (first) await VPNService.connect(first.address);
      }
      await appActions.updateStatus();
    } finally {
      appActions.setLoading(false);
    }
  }

  async function handleDisconnect() {
    try {
      appActions.setLoading(true);
      await VPNService.disconnect();
      await appActions.updateStatus();
    } finally {
      appActions.setLoading(false);
    }
  }

  onMount(appActions.updateStatus);

  return (
    <div class="flex flex-col h-full p-6 gap-6">
      <StatusIndicator
        status={appState.connectionStatus}
        isLoading={appState.isLoading}
      />

      {/* <ActionButton
        status={appState.connectionStatus}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        isLoading={appState.isLoading}
      /> */}

      <div class="mt-4">
        <h3 class="text-lg font-semibold mb-2">Available Destinations</h3>
        <div class="space-y-2">
          <For each={appState.availableDestinations}>
            {dest => (
              <div class="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-800 p-3">
                <div class="text-sm">
                  <div class="font-medium">{dest.address}</div>
                  <Show when={Object.keys(dest.meta || {}).length}>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {JSON.stringify(dest.meta)}
                    </div>
                  </Show>
                </div>
                <div>
                  <Show
                    when={!isConnected(appState.connectionStatus)}
                    fallback={<span class="text-green-600">Active</span>}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnect(dest)}
                    >
                      Connect
                    </Button>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <Navigation
        currentScreen={appState.currentScreen}
        onNavigate={s => appActions.setScreen(s)}
      />
    </div>
  );
}

export default MainScreen;
