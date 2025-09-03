import { For, Show, onCleanup, onMount } from 'solid-js';
import Button from '../components/common/Button';
import { useAppStore } from '../stores/appStore.tsx';
import type { Destination } from '../services/vpnService';
import { StatusIndicator } from '../components/StatusIndicator';
import Navigation from '../components/Navigation';
import Modal from '../components/common/Modal';
import SettingsPanel from '../components/SettingsPanel';
import LogsPanel from '../components/LogsPanel';
import {
  VPNService,
  isConnected,
  isConnectedTo,
  isConnecting,
  isConnectingTo,
  isServiceUnavailable,
} from '../services/vpnService';

export function MainScreen() {
  const [appState, appActions] = useAppStore();

  // console.log(appState);

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

  onMount(() => {
    appActions.updateStatus();
    appActions.startStatusPolling(2000);
  });

  onCleanup(() => {
    appActions.stopStatusPolling();
  });

  return (
    <div class="flex flex-col h-full p-6 gap-6 justify-between">
      <StatusIndicator
        status={appState.connectionStatus}
        isLoading={appState.isLoading}
      />

      <Show when={!isServiceUnavailable(appState.connectionStatus)}>
        <div class="mt-4">
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

      <Navigation
        currentScreen={appState.currentScreen}
        onNavigate={s => appActions.setScreen(s)}
      />

      <Modal
        open={appState.currentScreen === 'settings'}
        title="Settings"
        onClose={() => appActions.setScreen('main')}
      >
        <SettingsPanel />
      </Modal>

      <Modal
        open={appState.currentScreen === 'logs'}
        title="Logs"
        onClose={() => appActions.setScreen('main')}
      >
        <LogsPanel />
      </Modal>
    </div>
  );
}

export default MainScreen;
