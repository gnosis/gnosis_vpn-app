import { useContext } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
  type Status,
  type Destination,
  type Path,
  VPNService,
} from '../services/vpnService';
import { AppStoreContext } from './appContext';

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
    let content: string | undefined;
    if (args.response) {
      const statusValue = args.response.status;
      if (typeof statusValue === 'object') {
        if ('Connected' in statusValue || 'Connecting' in statusValue) {
          const isConnected = 'Connected' in statusValue;
          const destination = (statusValue as any)[
            isConnected ? 'Connected' : 'Connecting'
          ] as import('../services/vpnService').Destination;
          const city = destination.meta?.city || '';
          const location = destination.meta?.location || '';
          const where = [city, location].filter(Boolean).join(', ');
          content = `${isConnected ? 'Connected' : 'Connecting'}: ${where} - ${
            destination.address
          }`;
        }
      } else if (statusValue === 'Disconnected') {
        const lastWasDisconnected =
          state.logs.length > 0 &&
          state.logs[state.logs.length - 1].message.startsWith('Disconnected');
        if (lastWasDisconnected) {
          content = undefined;
        } else {
          const lines = args.response.available_destinations.map(d => {
            const city = d.meta?.city || '';
            const location = d.meta?.location || '';
            const where = [city, location].filter(Boolean).join(', ');
            return `- ${where} - ${d.address}`;
          });
          content = `Disconnected. Available:\n${lines.join('\n')}`;
        }
      } else {
        const statusLabel = statusValue;
        const destinations = args.response.available_destinations.length;
        content = `status: ${statusLabel}, destinations: ${destinations}`;
      }
    } else if (args.error) {
      content = `${args.error}`;
    }
    if (!content) return;
    appendContentIfNew(content);
  };

  const canonicalizeMeta = (
    meta: Record<string, string> | undefined
  ): string => {
    if (!meta) return '';
    const keys = Object.keys(meta).sort();
    const ordered: Record<string, string> = {};
    for (const key of keys) ordered[key] = meta[key];
    return JSON.stringify(ordered);
  };

  const canonicalizePath = (path: Path): string => {
    if ('Hops' in path) return `Hops:${path.Hops}`;
    return `IntermediatePath:${(path.IntermediatePath || []).join(',')}`;
  };

  const areDestinationsEqualUnordered = (
    a: Destination[],
    b: Destination[]
  ): boolean => {
    if (a.length !== b.length) return false;
    const aSorted = [...a].sort((x, y) => x.address.localeCompare(y.address));
    const bSorted = [...b].sort((x, y) => x.address.localeCompare(y.address));
    for (let i = 0; i < aSorted.length; i += 1) {
      const da = aSorted[i];
      const db = bSorted[i];
      if (da.address !== db.address) return false;
      if (canonicalizeMeta(da.meta) !== canonicalizeMeta(db.meta)) return false;
      if (canonicalizePath(da.path) !== canonicalizePath(db.path)) return false;
    }
    return true;
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
    setLoading: (loading: boolean) => setState('isLoading', loading),
    setError: (error?: string) => setState('error', error),
    appendLog: (line: string) => appendContentIfNew(line),
    clearLogs: () => setState('logs', []),

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
