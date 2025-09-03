import { useContext } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
  type Status,
  type Destination,
  VPNService,
} from '../services/vpnService';
import { AppStoreContext } from './appContext';
import { buildStatusLog } from '../utils/status';
import { areDestinationsEqualUnordered } from '../utils/destinations';

export type AppScreen = 'main' | 'settings' | 'logs';

export interface AppState {
  currentScreen: AppScreen;
  connectionStatus: Status;
  availableDestinations: Destination[];
  isLoading: boolean;
  error?: string;
  logs: { date: string; message: string }[];
}

export function createAppStore() {
  const [state, setState] = createStore<AppState>({
    currentScreen: 'main',
    connectionStatus: 'ServiceUnavailable',
    availableDestinations: [],
    isLoading: false,
    logs: [],
  });

  let pollingId: number | undefined;
  let pollInFlight = false;

  const appendContentIfNew = (content: string) =>
    setState('logs', existingLogs => {
      const lastMessage = existingLogs.length
        ? existingLogs[existingLogs.length - 1].message
        : '';
      if (lastMessage === content) return existingLogs;
      const entry = { date: new Date().toISOString(), message: content };
      return [...existingLogs, entry];
    });

  const appendLogIfNew = (args: {
    response?: import('../services/vpnService').StatusResponse;
    error?: string;
  }) => {
    const content = buildStatusLog(state.logs, args);
    if (!content) return;
    appendContentIfNew(content);
  };

  const getStatus = async () => {
    try {
      const response = await VPNService.getStatus();
      appendLogIfNew({ response });
      if (response.status !== state.connectionStatus) {
        setState('connectionStatus', response.status);
      }
      if (
        !areDestinationsEqualUnordered(
          response.available_destinations,
          state.availableDestinations
        )
      ) {
        setState('availableDestinations', response.available_destinations);
      }
      setState('error', undefined);
    } catch (error) {
      appendLogIfNew({
        error: error instanceof Error ? error.message : String(error),
      });
      setState('isLoading', false);
      setState('connectionStatus', 'ServiceUnavailable');
      setState('availableDestinations', []);
      setState('error', error instanceof Error ? error.message : String(error));
    }
  };

  const actions = {
    setScreen: (screen: AppScreen) => setState('currentScreen', screen),
    setConnectionStatus: (status: Status) =>
      setState('connectionStatus', status),
    setError: (error?: string) => setState('error', error),
    appendLog: (line: string) => appendContentIfNew(line),
    clearLogs: () => setState('logs', []),

    connect: async (address?: string) => {
      setState('isLoading', true);
      try {
        const targetAddress =
          address ?? state.availableDestinations[0]?.address ?? undefined;
        if (targetAddress) {
          await VPNService.connect(targetAddress);
        }
        await getStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLogIfNew({ error: message });
        setState('error', message);
      } finally {
        setState('isLoading', false);
      }
    },

    disconnect: async () => {
      setState('isLoading', true);
      try {
        await VPNService.disconnect();
        await getStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLogIfNew({ error: message });
        setState('error', message);
      } finally {
        setState('isLoading', false);
      }
    },

    updateStatus: async () => {
      setState('isLoading', true);
      await getStatus();
      setState('isLoading', false);
    },

    startStatusPolling: (intervalMs: number = 2000) => {
      if (pollingId !== undefined) return;
      const tick = async () => {
        if (pollInFlight) return;
        pollInFlight = true;
        await getStatus();
        pollInFlight = false;
      };

      // immediate tick, then interval
      void tick();
      pollingId = window.setInterval(() => void tick(), intervalMs);
    },

    stopStatusPolling: () => {
      if (pollingId !== undefined) {
        window.clearInterval(pollingId);
        pollingId = undefined;
      }
    },
  } as const;

  return [state, actions] as const;
}

export type AppStoreTuple = ReturnType<typeof createAppStore>;

export function useAppStore(): AppStoreTuple {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider');
  return ctx;
}

export default createAppStore;
