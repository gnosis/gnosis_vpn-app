import { createStore, type Store as SolidStore } from "solid-js/store";
import { Store as TauriStore } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";

export interface SettingsState {
  preferredLocation: string | null;
  connectOnStartup: boolean;
  startMinimized: boolean;
  exitNodeSortOrder: "latency" | "alpha";
}

const DEFAULT_SETTINGS: SettingsState = {
  preferredLocation: null,
  connectOnStartup: false,
  startMinimized: false,
  exitNodeSortOrder: "latency",
};

type SettingsActions = {
  load: () => Promise<void>;
  setPreferredLocation: (id: string | null) => Promise<void>;
  setConnectOnStartup: (enabled: boolean) => Promise<void>;
  setStartMinimized: (enabled: boolean) => Promise<void>;
  setExitNodeSortOrder: (order: "latency" | "alpha") => Promise<void>;
  save: () => Promise<void>;
};

type SettingsStoreTuple = readonly [
  SolidStore<SettingsState>,
  SettingsActions,
  () => void,
];

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
  await store.set("exitNodeSortOrder", state.exitNodeSortOrder);
  await store.save();
}

export function createSettingsStore(): SettingsStoreTuple {
  const [state, setState] = createStore<SettingsState>({ ...DEFAULT_SETTINGS });

  const actions: SettingsActions = {
    load: async () => {
      const store = await getTauriStore();
      const loaded: SettingsState = { ...DEFAULT_SETTINGS };

      const [
        preferredLocation,
        connectOnStartup,
        startMinimized,
        exitNodeSortOrder,
      ] = (await Promise.all([
        store.get("preferredLocation"),
        store.get("connectOnStartup"),
        store.get("startMinimized"),
        store.get("exitNodeSortOrder"),
      ])) as [
        SettingsState["preferredLocation"] | undefined,
        boolean | undefined,
        boolean | undefined,
        "latency" | "alpha" | undefined,
      ];

      if (preferredLocation) {
        loaded.preferredLocation = preferredLocation;
      }
      if (connectOnStartup !== undefined) {
        loaded.connectOnStartup = connectOnStartup;
      }
      if (startMinimized !== undefined) {
        loaded.startMinimized = startMinimized;
      }
      const isValidExitNodeSortOrder = exitNodeSortOrder === "latency" ||
        exitNodeSortOrder === "alpha";
      if (isValidExitNodeSortOrder) {
        loaded.exitNodeSortOrder = exitNodeSortOrder;
      }

      setState({ ...loaded });

      const missingAny = preferredLocation === undefined ||
        connectOnStartup === undefined ||
        startMinimized === undefined ||
        !isValidExitNodeSortOrder;
      if (missingAny) {
        await saveAllToDisk(loaded);
      }
    },

    setPreferredLocation: async (id: string | null) => {
      if (!id) {
        return;
      }
      setState("preferredLocation", id);
      const store = await getTauriStore();
      await store.set("preferredLocation", id);
      await store.save();
      void emit("settings:update", { preferredLocation: id });
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

    setExitNodeSortOrder: async (order: "latency" | "alpha") => {
      const prev = state.exitNodeSortOrder;
      try {
        const store = await getTauriStore();
        await store.set("exitNodeSortOrder", order);
        await store.save();
        setState("exitNodeSortOrder", order);
        void emit("settings:update", { exitNodeSortOrder: order });
      } catch (e) {
        setState("exitNodeSortOrder", prev);
        throw e;
      }
    },

    save: async () => {
      await saveAllToDisk(state);
    },
  } as const;

  let unlistenSettings: (() => void) | undefined;
  listen<Partial<SettingsState>>("settings:update", ({ payload }) => {
    if (payload.preferredLocation !== undefined) {
      setState("preferredLocation", payload.preferredLocation);
    }
    if (payload.connectOnStartup !== undefined) {
      setState("connectOnStartup", payload.connectOnStartup);
    }
    if (payload.startMinimized !== undefined) {
      setState("startMinimized", payload.startMinimized);
    }
    if (
      payload.exitNodeSortOrder === "latency" ||
      payload.exitNodeSortOrder === "alpha"
    ) {
      setState("exitNodeSortOrder", payload.exitNodeSortOrder);
    }
  }).then((u) => {
    unlistenSettings = u;
  })
    .catch((e) => console.error("settings:update listener failed", e));

  const dispose = () => {
    unlistenSettings?.();
  };

  return [state, actions, dispose] as const;
}

const settingsStore = createSettingsStore();

export function useSettingsStore(): SettingsStoreTuple {
  return settingsStore;
}
