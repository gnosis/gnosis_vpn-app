import { createStore, type Store as SolidStore } from "solid-js/store";
import { Store as TauriStore } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";

export type ThemePreference = "auto" | "light" | "dark";

export interface SettingsState {
  preferredLocation: string | null;
  connectOnStartup: boolean;
  startMinimized: boolean;
  updateCheck: boolean;
  theme: ThemePreference;
  exitNodeSortOrder: "latency" | "alpha";
}

const DEFAULT_SETTINGS: SettingsState = {
  preferredLocation: null,
  connectOnStartup: false,
  startMinimized: false,
  updateCheck: false,
  theme: "auto",
  exitNodeSortOrder: "latency",
};

type SettingsActions = {
  load: () => Promise<void>;
  setPreferredLocation: (id: string | null) => Promise<void>;
  setConnectOnStartup: (enabled: boolean) => Promise<void>;
  setStartMinimized: (enabled: boolean) => Promise<void>;
  setUpdateCheck: (enabled: boolean) => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
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
  await store.set("updateCheck", state.updateCheck);
  await store.set("theme", state.theme);
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
        updateCheck,
        theme,
        exitNodeSortOrder,
      ] = (await Promise.all([
        store.get("preferredLocation"),
        store.get("connectOnStartup"),
        store.get("startMinimized"),
        store.get("updateCheck"),
        store.get("theme"),
        store.get("exitNodeSortOrder"),
      ])) as [
        SettingsState["preferredLocation"] | undefined,
        boolean | undefined,
        boolean | undefined,
        boolean | undefined,
        ThemePreference | undefined,
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
      if (updateCheck !== undefined) {
        loaded.updateCheck = updateCheck;
      }
      const isValidTheme = theme === "auto" || theme === "light" ||
        theme === "dark";
      if (isValidTheme) {
        loaded.theme = theme;
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
        updateCheck === undefined ||
        !isValidTheme ||
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
      try {
        const store = await getTauriStore();
        await store.set("preferredLocation", id);
        await store.save();
      } catch (e) {
        console.error("Failed to save preferredLocation", e);
      }
      void emit("settings:update", { preferredLocation: id });
    },

    setConnectOnStartup: async (enabled: boolean) => {
      setState("connectOnStartup", enabled);
      try {
        const store = await getTauriStore();
        await store.set("connectOnStartup", enabled);
        await store.save();
      } catch (e) {
        console.error("Failed to save connectOnStartup", e);
      }
      void emit("settings:update", { connectOnStartup: enabled });
    },

    setStartMinimized: async (enabled: boolean) => {
      setState("startMinimized", enabled);
      try {
        const store = await getTauriStore();
        await store.set("startMinimized", enabled);
        await store.save();
      } catch (e) {
        console.error("Failed to save startMinimized", e);
      }
      void emit("settings:update", { startMinimized: enabled });
    },

    setUpdateCheck: async (enabled: boolean) => {
      setState("updateCheck", enabled);
      try {
        const store = await getTauriStore();
        await store.set("updateCheck", enabled);
        await store.save();
      } catch (e) {
        console.error("Failed to save updateCheck", e);
      }
      void emit("settings:update", { updateCheck: enabled });
    },

    setTheme: async (theme: ThemePreference) => {
      setState("theme", theme);

      // Apply immediately to the current window without waiting for the event round-trip.
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else if (theme === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        const mq = globalThis.matchMedia("(prefers-color-scheme: dark)");
        document.documentElement.classList.toggle("dark", mq.matches);
      }

      // Notify other windows immediately, then persist to disk.
      void emit("settings:update", { theme });
      try {
        const store = await getTauriStore();
        await store.set("theme", theme);
        await store.save();
      } catch (e) {
        console.error("Failed to save theme", e);
      }
    },

    setExitNodeSortOrder: async (order: "latency" | "alpha") => {
      setState("exitNodeSortOrder", order);
      try {
        const store = await getTauriStore();
        await store.set("exitNodeSortOrder", order);
        await store.save();
      } catch (e) {
        console.error("Failed to save exitNodeSortOrder", e);
      }
      void emit("settings:update", { exitNodeSortOrder: order });
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
    if (payload.updateCheck !== undefined) {
      setState("updateCheck", payload.updateCheck);
    }
    if (
      payload.theme === "auto" || payload.theme === "light" ||
      payload.theme === "dark"
    ) {
      setState("theme", payload.theme);
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
