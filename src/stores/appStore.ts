import { createStore, type Store } from 'solid-js/store';
import {
  type Status,
  type Destination,
  VPNService,
} from '../services/vpnService';
import { buildStatusLog } from '../utils/status';
import { areDestinationsEqualUnordered } from '../utils/destinations';
import { useSettingsStore } from './settingsStore';

export type AppScreen = 'main' | 'settings' | 'logs' | 'usage';

export interface AppState {
  currentScreen: AppScreen;
  connectionStatus: Status;
  availableDestinations: Destination[];
  isLoading: boolean;
  error?: string;
  logs: { date: string; message: string }[];
}

type AppActions = {
  setScreen: (screen: AppScreen) => void;
  connect: (address?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  startStatusPolling: (intervalMs?: number) => void;
  stopStatusPolling: () => void;
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

export function createAppStore(): AppStoreTuple {
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

    connect: async (address?: string) => {
      setState('isLoading', true);
      try {
        const [settings] = useSettingsStore();

        let targetAddress: string | undefined = undefined;
        let selectionReason = '';

        if (address) {
          targetAddress = address;
          selectionReason = 'address parameter';
        } else {
          const preferred = settings.preferredLocation;
          if (preferred) {
            const preferredExists = state.availableDestinations.some(
              d => d.address === preferred
            );
            if (preferredExists) {
              targetAddress = preferred;
              selectionReason = 'preferred location';
            } else {
              targetAddress = state.availableDestinations[0]?.address;
              selectionReason = 'fallback: preferred not present';
            }
          } else {
            targetAddress = state.availableDestinations[0]?.address;
            selectionReason = 'fallback: no preferred set';
          }
        }

        appendContentIfNew(
          `Connect target: ${targetAddress ?? 'none'} (${selectionReason})`
        );

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

    refreshStatus: async () => {
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

const appStore = createAppStore();

export function useAppStore(): AppStoreTuple {
  return appStore;
}
