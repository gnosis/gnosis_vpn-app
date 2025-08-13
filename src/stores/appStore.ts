import { createStore } from 'solid-js/store';
import {
  type Status,
  type Destination,
  type Path,
  VPNService,
} from '../services/vpnService';

export type AppScreen = 'main' | 'settings' | 'logs';

export interface AppState {
  currentScreen: AppScreen;
  connectionStatus: Status;
  availableDestinations: Destination[];
  isLoading: boolean;
  error?: string;
}

export function createAppStore() {
  const [state, setState] = createStore<AppState>({
    currentScreen: 'main',
    connectionStatus: 'ServiceUnavailable',
    availableDestinations: [],
    isLoading: false,
  });

  let pollingId: number | undefined;
  let pollInFlight = false;

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
      console.log('response', response);
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
