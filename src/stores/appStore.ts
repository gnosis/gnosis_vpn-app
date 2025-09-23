import { createStore, type Store } from 'solid-js/store';
import {
  type Status,
  type Destination,
  VPNService,
} from '../services/vpnService';
import { buildLogContent } from '../utils/status';
import {
  areDestinationsEqualUnordered,
  getPreferredAvailabilityChangeMessage,
  selectTargetAddress,
  formatDestinationByAddress,
} from '../utils/destinations';
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
  log: (message: string) => void;
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

  const [settings] = useSettingsStore();
  let lastPreferredLocation: string | null = settings.preferredLocation;
  let hasInitializedPreferred = false;

  const appendContentIfNew = (content: string) =>
    setState('logs', existingLogs => {
      const lastMessage = existingLogs.length
        ? existingLogs[existingLogs.length - 1].message
        : '';
      if (lastMessage === content) return existingLogs;
      const entry = { date: new Date().toISOString(), message: content };
      return [...existingLogs, entry];
    });

  let lastStatusLogMessage: string | undefined;

  const appendStatusLogIfNew = (
    response: import('../services/vpnService').StatusResponse
  ) => {
    const content = buildLogContent({ response }, lastStatusLogMessage);
    if (!content) return;
    if (content !== lastStatusLogMessage) {
      appendContentIfNew(content);
      lastStatusLogMessage = content;
    }
  };

  const appendErrorLogIfNew = (message: string) => {
    appendContentIfNew(message);
  };

  const getStatus = async () => {
    try {
      const response = await VPNService.getStatus();
      const prefMsg = getPreferredAvailabilityChangeMessage(
        state.availableDestinations,
        response.available_destinations,
        settings.preferredLocation
      );
      if (prefMsg) appendContentIfNew(prefMsg);

      if (!hasInitializedPreferred) {
        // On first tick after startup, treat current value as baseline (no user change)
        lastPreferredLocation = settings.preferredLocation;
        hasInitializedPreferred = true;
      }

      const preferredChanged =
        settings.preferredLocation !== lastPreferredLocation;
      if (preferredChanged) {
        const nowHasPreferred = settings.preferredLocation
          ? response.available_destinations.some(
              d => d.address === settings.preferredLocation
            )
          : false;
        if (settings.preferredLocation) {
          if (nowHasPreferred) {
            const pretty = formatDestinationByAddress(
              settings.preferredLocation,
              response.available_destinations
            );
            appendContentIfNew(`Preferred location set to ${pretty}.`);
          } else {
            appendContentIfNew(
              `Preferred location ${settings.preferredLocation} currently unavailable.`
            );
          }
        }
        lastPreferredLocation = settings.preferredLocation;
      }
      if (!preferredChanged) {
        appendStatusLogIfNew(response);
      }
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
      appendErrorLogIfNew(
        error instanceof Error ? error.message : String(error)
      );
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
        const { address: targetAddress, reason: selectionReason } =
          selectTargetAddress(
            address,
            settings.preferredLocation,
            state.availableDestinations
          );

        appendContentIfNew(
          `Connecting to ${selectionReason}: ${targetAddress ?? 'none'}`
        );

        if (targetAddress) {
          await VPNService.connect(targetAddress);
        }
        await getStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendErrorLogIfNew(message);
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
        appendErrorLogIfNew(message);
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

    log: (message: string) => {
      setState('logs', [
        ...state.logs,
        { date: new Date().toISOString(), message },
      ]);
    },
  } as const;

  return [state, actions] as const;
}

const appStore = createAppStore();

export function useAppStore(): AppStoreTuple {
  return appStore;
}
