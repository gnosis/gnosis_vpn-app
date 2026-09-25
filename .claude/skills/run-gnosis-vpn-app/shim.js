// Browser-only Tauri shim, injected before /src/index.tsx by driver.ts. Answers the app's
// invoke() calls from globalThis.__GVPN_FIXTURE__ so the UI runs without the Rust backend.
(() => {
  const fixture = globalThis.__GVPN_FIXTURE__ ?? {};
  const label = fixture.windowLabel ?? "main";
  let cbId = 0;
  const callbacks = new Map(); // transformCallback id -> fn
  const eventListeners = new Map(); // event name -> Set<handler id>

  // Settings are rust-owned in the real app. Seeded from fixture.settings over the defaults;
  // update_settings merges the patch and broadcasts, mirroring src-tauri/src/settings.rs.
  const settings = {
    preferredLocation: null,
    lastConnectedDestination: null,
    connectOnStartup: false,
    startMinimized: false,
    updateCheck: true,
    exitNodeSortOrder: "latency",
    lastCheckedAt: null,
    lastCheckOutcome: null,
    channel: null,
    dismissedUpdateVersion: null,
    installedVersion: null,
    showDetailedMetrics: false,
    flagDisplay: "color",
    ...(fixture.settings ?? {}),
  };

  const fireEvent = (event, payload) => {
    for (const id of eventListeners.get(event) ?? []) {
      callbacks.get(id)?.({ event, id, payload });
    }
  };

  // On-demand event firing for driver `eval` steps (mount time varies, timers can't be trusted)
  globalThis.__GVPN_FIRE_EVENT__ = fireEvent;

  // Every URL the app asked the system to open, newest last.
  const openedUrls = [];
  globalThis.__GVPN_OPENED_URLS__ = openedUrls;

  // Replays fixture.statusScript steps as "status" events ({Ok: StatusResponse} payloads); delays must exceed mount time so listeners exist
  for (const step of fixture.statusScript ?? []) {
    setTimeout(() => fireEvent("status", step.status), step.delay);
  }

  // update-install flow (macOS): install_update replays fixture.installScript or this default
  // as update-install-status events, as the Rust command streams the binary's NDJSON phases.
  const defaultInstallScript = [
    { delay: 100, status: { kind: "Checking" } },
    { delay: 400, status: { kind: "Downloading" } },
    { delay: 1500, status: { kind: "Installing" } },
    { delay: 2500, status: { kind: "Completed", new_version: "9.9.9" } },
  ];

  // Every probe/quick_probe issued, in order, for `eval` steps to assert on.
  const probes = [];
  globalThis.__GVPN_PROBES__ = probes;

  const findDestination = (id) =>
    fixture.cached_state?.status?.Ok?.destinations?.find((ds) =>
      ds.destination.id === id
    )?.destination ?? null;

  const handlers = {
    get_cached_state: () => fixture.cached_state,
    get_initial_theme: () => fixture.theme ?? "dark",
    get_platform: () => fixture.platform ?? "linux",
    get_install_status: () => fixture.installStatus ?? null,
    get_toolkit_version: () => {
      if (fixture.toolkitVersion === null) {
        return Promise.reject("ToolkitMissing");
      }
      if (fixture.toolkitStatus === "tooOld") {
        return Promise.reject("ToolkitTooOld");
      }
      if (fixture.toolkitStatus === "failed") {
        return Promise.reject(fixture.toolkitError ?? "ToolkitTimedOut");
      }
      return {
        version: fixture.toolkitVersion ?? "0.4.0",
        // `in`, not `??`: an explicit null is the toolkit finding no version
        // file, which only the daemon fallback should fill when the key is absent.
        package_version: "packageVersion" in fixture
          ? fixture.packageVersion
          : fixture.cached_state?.service_info?.package_version ?? null,
      };
    },
    install_update: () => {
      for (const step of fixture.installScript ?? defaultInstallScript) {
        setTimeout(
          () => fireEvent("update-install-status", step.status),
          step.delay,
        );
      }
      return null;
    },
    // Resolves after checkUpdateDelayMs with fixture.checkUpdateResult ({channel, outcome,
    // manifest}), else an UpToDate wrapper; checkUpdateError (e.g. "VpnNotConnected") rejects.
    check_update: () =>
      new Promise((resolve, reject) =>
        setTimeout(() => {
          if (fixture.checkUpdateError) return reject(fixture.checkUpdateError);
          if (fixture.checkUpdateResult) {
            return resolve(fixture.checkUpdateResult);
          }
          const manifest = fixture.checkUpdateManifest ?? null;
          const current = fixture.packageVersion ??
            fixture.cached_state?.service_info?.package_version ?? "0.0.0";
          resolve({
            channel: settings.channel ?? "stable",
            outcome: { kind: "UpToDate", current },
            manifest,
          });
        }, fixture.checkUpdateDelayMs ?? 2000)
      ),
    // Probing has no backend here: answer as the daemon would, record the call, and let statusScript carry results.
    probe: ({ id }) => {
      probes.push({ command: "probe", id });
      const destination = findDestination(id);
      return destination
        ? { type: "Probing", destination }
        : { type: "DestinationNotFound" };
    },
    quick_probe: ({ id }) => {
      probes.push({ command: "quick_probe", id });
      const destination = findDestination(id);
      return destination
        ? { type: "Checking", destination }
        : { type: "DestinationNotFound" };
    },
    set_status_poll_fast: () => null,
    log_from_frontend: () => null,
    export_logs: (args) => args?.destPath ?? "/tmp/gnosis_vpn-export.log.zst",
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
    // Recorded rather than opened, so an `eval` step can assert the target.
    "plugin:opener|open_url": (args) => {
      openedUrls.push(args?.url);
      return null;
    },
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

  // index.tsx trusts matchMedia over the backend theme, so force it in both directions —
  // the browser's own prefers-color-scheme follows the host OS, not the fixture.
  const wantDark = (fixture.theme ?? "dark") === "dark";
  const origMatchMedia = globalThis.matchMedia.bind(globalThis);
  globalThis.matchMedia = (query) => {
    const asksDark = query.includes("dark");
    const asksLight = query.includes("light");
    // Anything not about the color scheme is none of our business.
    if (!asksDark && !asksLight) return origMatchMedia(query);
    return {
      matches: asksDark ? wantDark : !wantDark,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    };
  };
})();
