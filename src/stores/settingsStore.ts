import { createStore, type Store as SolidStore } from 'solid-js/store';
import { Store as TauriStore } from '@tauri-apps/plugin-store';

export interface SettingsState {
  preferredLocation: string | null;
  connectOnStartup: boolean;
  startMinimized: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  preferredLocation: null,
  connectOnStartup: false,
  startMinimized: true,
};

type SettingsActions = {
  load: () => Promise<void>;
  setPreferredLocation: (address: string | null) => Promise<void>;
  setConnectOnStartup: (enabled: boolean) => Promise<void>;
  setStartMinimized: (enabled: boolean) => Promise<void>;
  save: () => Promise<void>;
};

type SettingsStoreTuple = readonly [SolidStore<SettingsState>, SettingsActions];

let tauriStore: TauriStore | undefined;

async function getTauriStore(): Promise<TauriStore> {
  if (!tauriStore) {
    tauriStore = await TauriStore.load('settings.json');
  }
  return tauriStore;
}

async function saveAllToDisk(state: SettingsState): Promise<void> {
  const store = await getTauriStore();
  await store.set('preferredLocation', state.preferredLocation);
  await store.set('connectOnStartup', state.connectOnStartup);
  await store.set('startMinimized', state.startMinimized);
  await store.save();
}

export function createSettingsStore(): SettingsStoreTuple {
  const [state, setState] = createStore<SettingsState>({ ...DEFAULT_SETTINGS });

  const actions: SettingsActions = {
    load: async () => {
      const store = await getTauriStore();
      const loaded: SettingsState = { ...DEFAULT_SETTINGS };

      const [preferredLocation, connectOnStartup, startMinimized] = (await Promise.all([
        store.get('preferredLocation'),
        store.get('connectOnStartup'),
        store.get('startMinimized'),
      ])) as [
        SettingsState['preferredLocation'] | undefined,
        boolean | undefined,
        boolean | undefined,
      ];

      if (preferredLocation !== undefined) {
        loaded.preferredLocation = preferredLocation;
      }
      if (connectOnStartup !== undefined) {
        loaded.connectOnStartup = connectOnStartup;
      }
      if (startMinimized !== undefined) {
        loaded.startMinimized = startMinimized;
      }

      setState({ ...loaded });

      const missingAny =
        preferredLocation === undefined ||
        connectOnStartup === undefined ||
        startMinimized === undefined;
      if (missingAny) {
        await saveAllToDisk(loaded);
      }
    },

    setPreferredLocation: async (address: string | null) => {
      setState('preferredLocation', address);
      const store = await getTauriStore();
      await store.set('preferredLocation', address);
      await store.save();
    },

    setConnectOnStartup: async (enabled: boolean) => {
      setState('connectOnStartup', enabled);
      const store = await getTauriStore();
      await store.set('connectOnStartup', enabled);
      await store.save();
    },

    setStartMinimized: async (enabled: boolean) => {
      setState('startMinimized', enabled);
      const store = await getTauriStore();
      await store.set('startMinimized', enabled);
      await store.save();
    },

    save: async () => {
      await saveAllToDisk(state);
    },
  } as const;

  return [state, actions] as const;
}

const settingsStore = createSettingsStore();

export function useSettingsStore(): SettingsStoreTuple {
  return settingsStore;
}
