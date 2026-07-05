// Browser-only Tauri shim. Injected before /src/index.tsx by driver.ts
// (via the generated index.browser.html). Answers the app's invoke() calls
// from a fixture (globalThis.__GVPN_FIXTURE__) so the UI drives itself to a
// real screen without the Rust backend.
(() => {
  const fixture = globalThis.__GVPN_FIXTURE__ ?? {};
  const label = fixture.windowLabel ?? "main";
  let cbId = 0;

  // Seeded from fixture.settings and kept in memory, so settings-dependent
  // screens (sort order, update banner, detailed metrics, …) can be fixtured.
  // Keys mirror what settingsStore.ts persists; unset keys fall back to the
  // app's DEFAULT_SETTINGS.
  const storeData = { ...(fixture.settings ?? {}) };

  const handlers = {
    get_cached_state: () => fixture.cached_state,
    get_initial_theme: () => fixture.theme ?? "dark",
    "plugin:event|listen": () => ++cbId,
    "plugin:event|unlisten": () => null,
    "plugin:event|emit": () => null,
    "plugin:store|load": () => 1,
    "plugin:store|get": ({ key }) =>
      key in storeData ? [storeData[key], true] : [null, false],
    "plugin:store|set": ({ key, value }) => {
      storeData[key] = value;
      return null;
    },
    "plugin:store|save": () => null,
    "plugin:app|version": () => fixture.appVersion ?? "0.0.0-fixture",
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
    transformCallback: () => ++cbId,
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
