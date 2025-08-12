import { createStore } from 'solid-js/store';
import type { Status, AppState, AppScreen } from '../types';
import { VPNService } from '../services';

export function createAppStore() {
  const [state, setState] = createStore<AppState>({
    currentScreen: 'main',
    connectionStatus: 'Disconnected',
    availableDestinations: [],
    isLoading: false,
  });

  const actions = {
    setScreen: (screen: AppScreen) => setState('currentScreen', screen),
    setConnectionStatus: (status: Status) =>
      setState('connectionStatus', status),
    setLoading: (loading: boolean) => setState('isLoading', loading),
    setError: (error?: string) => setState('error', error),
    updateStatus: async () => {
      setState('isLoading', true);
      try {
        const response = await VPNService.getStatus();
        setState('connectionStatus', response.status);
        setState('availableDestinations', response.available_destinations);
        setState('error', undefined);
      } catch (error) {
        setState(
          'error',
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        setState('isLoading', false);
      }
    },
  } as const;

  return [state, actions] as const;
}
