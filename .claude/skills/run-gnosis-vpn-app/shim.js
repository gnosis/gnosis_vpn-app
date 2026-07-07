// Browser-only Tauri shim. Injected before /src/index.tsx by driver.ts
// (via the generated index.browser.html). Answers the app's invoke() calls
// from a fixture (globalThis.__GVPN_FIXTURE__) so the UI drives itself to a
// real screen without the Rust backend.
(() => {
  const fixture = globalThis.__GVPN_FIXTURE__ ?? {};
  const label = fixture.windowLabel ?? "main";
  let cbId = 0;
  const callbacks = new Map(); // transformCallback id -> fn
  const eventListeners = new Map(); // event name -> Set<handler id>

  // Settings are rust-owned in the real app (get_settings/update_settings +
  // settings-changed event). Seeded from fixture.settings over the app
  // defaults; update_settings merges the patch and broadcasts the full
  // snapshot to listeners, mirroring src-tauri/src/settings.rs.
  const settings = {
    preferredLocation: null,
    connectOnStartup: false,
    startMinimized: false,
    updateCheck: false,
    exitNodeSortOrder: "latency",
    lastCheckedAt: null,
    updateManifest: null,
    channel: null,
    dismissedUpdateVersion: null,
    showDetailedMetrics: false,
    ...(fixture.settings ?? {}),
  };

  const fireEvent = (event, payload) => {
    for (const id of eventListeners.get(event) ?? []) {
      callbacks.get(id)?.({ event, id, payload });
    }
  };

  const handlers = {
    get_cached_state: () => fixture.cached_state,
    get_initial_theme: () => fixture.theme ?? "dark",
    get_settings: () => ({ ...settings }),
    update_settings: ({ patch }) => {
      Object.assign(settings, patch);
      const snapshot = { ...settings };
      fireEvent("settings-changed", snapshot);
      return snapshot;
    },
    "plugin:event|listen": ({ event, handler }) => {
      if (!eventListeners.has(event)) eventListeners.set(event, new Set());
      eventListeners.get(event).add(handler);
      return handler;
    },
    "plugin:event|unlisten": ({ event, eventId }) => {
      eventListeners.get(event)?.delete(eventId);
      return null;
    },
    "plugin:event|emit": () => null,
    "plugin:app|version": () => fixture.appVersion ?? "0.0.0-fixture",
  };

  // unlisten() consults this before invoking plugin:event|unlisten
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };

  globalThis.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label },
      currentWebview: { label, windowLabel: label },
    },
    invoke: (cmd, args) => {
      const handler = handlers[cmd];
      if (handler) return Promise.resolve(handler(args));
      console.warn("[tauri-shim] unhandled invoke:", cmd, args);
      return Promise.reject(new Error(`tauri-shim: unhandled command ${cmd}`));
    },
    transformCallback: (fn) => {
      const id = ++cbId;
      callbacks.set(id, fn);
      return id;
    },
  };

  // index.tsx trusts matchMedia over the backend theme, so force it too.
  if ((fixture.theme ?? "dark") === "dark") {
    const origMatchMedia = globalThis.matchMedia.bind(globalThis);
    globalThis.matchMedia = (query) =>
      query.includes("dark")
        ? {
          matches: true,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }
        : origMatchMedia(query);
  }
})();
