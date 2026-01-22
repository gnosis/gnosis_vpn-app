import { createStore, type Store as SolidStore } from "solid-js/store";
import { Store as TauriStore } from "@tauri-apps/plugin-store";
import { getEthAddress } from "../utils/address.ts";
import { emit, listen } from "@tauri-apps/api/event";

export interface SettingsState {
  preferredLocation: string | null;
  connectOnStartup: boolean;
  startMinimized: boolean;
  darkMode: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  preferredLocation: null,
  connectOnStartup: false,
  startMinimized: false,
  darkMode: false,
};

type SettingsActions = {
  load: () => Promise<void>;
  setPreferredLocation: (address: string | null) => Promise<void>;
  setConnectOnStartup: (enabled: boolean) => Promise<void>;
  setStartMinimized: (enabled: boolean) => Promise<void>;
  setDarkMode: (enabled: boolean) => Promise<void>;
  save: () => Promise<void>;
};

type SettingsStoreTuple = readonly [SolidStore<SettingsState>, SettingsActions];

let tauriStore: TauriStore | undefined;

async function getTauriStore(): Promise<TauriStore> {
  if (!tauriStore) {
    tauriStore = await TauriStore.load("settings.json");
  }
  return tauriStore;
}

async function saveAllToDisk(state: SettingsState): Promise<void> {
  const store = await getTauriStore();
  await store.set("preferredLocation", state.preferredLocation);
  await store.set("connectOnStartup", state.connectOnStartup);
  await store.set("startMinimized", state.startMinimized);
  await store.set("darkMode", state.darkMode);
  await store.save();
}

export function createSettingsStore(): SettingsStoreTuple {
  const [state, setState] = createStore<SettingsState>({ ...DEFAULT_SETTINGS });

  const actions: SettingsActions = {
    load: async () => {
      const store = await getTauriStore();
      const loaded: SettingsState = { ...DEFAULT_SETTINGS };

      const [preferredLocation, connectOnStartup, startMinimized, darkMode] =
        (await Promise.all([
          store.get("preferredLocation"),
          store.get("connectOnStartup"),
          store.get("startMinimized"),
          store.get("darkMode"),
        ])) as [
          SettingsState["preferredLocation"] | undefined,
          boolean | undefined,
          boolean | undefined,
          boolean | undefined,
        ];

      if (preferredLocation !== undefined) {
        if (typeof preferredLocation === "string") {
          try {
            loaded.preferredLocation = getEthAddress(preferredLocation);
          } catch {
            loaded.preferredLocation = preferredLocation;
          }
        } else {
          loaded.preferredLocation = preferredLocation;
        }
      }
      if (connectOnStartup !== undefined) {
        loaded.connectOnStartup = connectOnStartup;
      }
      if (startMinimized !== undefined) {
        loaded.startMinimized = startMinimized;
      }
      if (darkMode !== undefined) {
        loaded.darkMode = darkMode;
      }

      setState({ ...loaded });

      const missingAny = preferredLocation === undefined ||
        connectOnStartup === undefined || startMinimized === undefined ||
        darkMode === undefined;
      if (missingAny) {
        await saveAllToDisk(loaded);
      }
    },

    setPreferredLocation: async (address: string | null) => {
      let normalized: string | null = address;
      if (address) {
        try {
          normalized = getEthAddress(address);
        } catch {
          normalized = address;
        }
      }
      setState("preferredLocation", normalized);
      const store = await getTauriStore();
      await store.set("preferredLocation", normalized);
      await store.save();
      void emit("settings:update", { preferredLocation: normalized });
    },

    setConnectOnStartup: async (enabled: boolean) => {
      setState("connectOnStartup", enabled);
      const store = await getTauriStore();
      await store.set("connectOnStartup", enabled);
      await store.save();
      void emit("settings:update", { connectOnStartup: enabled });
    },

    setStartMinimized: async (enabled: boolean) => {
      setState("startMinimized", enabled);
      const store = await getTauriStore();
      await store.set("startMinimized", enabled);
      await store.save();
      void emit("settings:update", { startMinimized: enabled });
    },

    setDarkMode: async (enabled: boolean) => {
      setState("darkMode", enabled);
      const store = await getTauriStore();
      await store.set("darkMode", enabled);
      await store.save();
      void emit("settings:update", { darkMode: enabled });
    },

    save: async () => {
      await saveAllToDisk(state);
    },
  } as const;

  void listen<Partial<SettingsState>>("settings:update", ({ payload }) => {
    if (payload.preferredLocation !== undefined) {
      setState("preferredLocation", payload.preferredLocation);
    }
    if (payload.connectOnStartup !== undefined) {
      setState("connectOnStartup", payload.connectOnStartup);
    }
    if (payload.startMinimized !== undefined) {
      setState("startMinimized", payload.startMinimized);
    }
    if (payload.darkMode !== undefined) {
      setState("darkMode", payload.darkMode);
    }
  });

  return [state, actions] as const;
}

const settingsStore = createSettingsStore();

export function useSettingsStore(): SettingsStoreTuple {
  return settingsStore;
}
