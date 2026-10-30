import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import TrafficGlobe from "@src/components/traffic/TrafficGlobe.tsx";
import { Dropdown } from "@src/components/common/Dropdown.tsx";
import Spinner from "@src/components/common/Spinner.tsx";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
import { formatRate } from "@src/utils/trafficFormat.ts";
import {
  averageRates,
  type CaptureStatus,
  type ConnectedExit,
  connectedExit,
  fetchConnectedExit,
  fetchTrafficFrame,
  listTrafficInterfaces,
  startTrafficCapture,
  stopTrafficCapture,
  type TrafficFrame,
  type TrafficInterface,
} from "@src/services/trafficService.ts";

/** Frame cadence; one request is in flight at a time. */
const FRAME_INTERVAL_MS = 100;

export default function TrafficWindow() {
  const [interfaces, setInterfaces] = createSignal<TrafficInterface[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [frame, setFrame] = createSignal<TrafficFrame | null>(null);
  const [capture, setCapture] = createSignal<CaptureStatus | null>(null);
  const [busy, setBusy] = createSignal(true);
  const [failure, setFailure] = createSignal<string | null>(null);
  const [gap, setGap] = createSignal(false);
  const [exit, setExit] = createSignal<ConnectedExit | null>(null);
  const [, settingsActions] = useSettingsStore();

  let disposed = false;
  let polling = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const selected = createMemo(() =>
    interfaces().find((entry) => entry.id === selectedId()) ?? null
  );
  const endpoints = createMemo(() => frame()?.endpoints ?? []);
  const observedSeconds = createMemo(() => frame()?.observed_seconds ?? 0);
  const rates = createMemo(() => {
    const current = frame();
    return current ? averageRates(current) : null;
  });

  const stopPolling = () => {
    polling = false;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const tick = async () => {
    if (disposed || !polling) return;
    try {
      const response = await fetchTrafficFrame();
      if (disposed || !polling) return;
      setFrame(response.frame);
      setCapture(response.capture);
      setGap(response.gap);
      setFailure(null);
      if (!response.capture.active) {
        stopPolling();
        // Surface an unexpected end with a way to start over.
        const reason = response.capture.error ??
          (response.capture.ended
            ? `Capture ended: ${response.capture.ended}`
            : null);
        if (reason) setFailure(reason);
        return;
      }
    } catch (error) {
      logWarn(`traffic frame request failed: ${error}`);
      setFailure(String(error));
      stopPolling();
      return;
    }
    timer = setTimeout(() => void tick(), FRAME_INTERVAL_MS);
  };

  const beginPolling = () => {
    stopPolling();
    polling = true;
    setBusy(false);
    void tick();
  };

  const startCapture = async (interfaceId: string) => {
    setBusy(true);
    setFailure(null);
    setGap(false);
    setSelectedId(interfaceId);
    setFrame(null);
    // A previous session may still be running; the daemon replaces it anyway.
    await stopTrafficCapture().catch(() => {});
    try {
      const status = await startTrafficCapture(interfaceId);
      if (disposed) return;
      setCapture(status);
      if (!status.active) {
        setBusy(false);
        setFailure(status.error ?? status.ended ?? "capture did not start");
        return;
      }
      logInfo(`traffic capture started on ${interfaceId}`);
      beginPolling();
    } catch (error) {
      logWarn(`traffic capture failed to start: ${error}`);
      setBusy(false);
      setFailure(String(error));
    }
  };

  const load = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const list = await listTrafficInterfaces();
      if (disposed) return;
      setInterfaces(list);
      const preferred = list.find((entry) => entry.is_default) ??
        (list.length === 1 ? list[0] : null);
      if (!preferred) {
        setBusy(false);
        return;
      }
      await startCapture(preferred.id);
    } catch (error) {
      if (disposed) return;
      logWarn(`cannot list capture interfaces: ${error}`);
      setBusy(false);
      setFailure(String(error));
    }
  };

  onMount(() => {
    let unlistenOpen: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    // The flag honours the user's flag display setting.
    void settingsActions.load();

    void (async () => {
      const unlisten = await listen("status", (event) => {
        setExit(connectedExit(event.payload));
      });
      if (disposed) unlisten();
      else unlistenStatus = unlisten;
      const cached = await fetchConnectedExit();
      if (!disposed) setExit(cached);
    })().catch((error) => {
      logWarn(`cannot follow the connection status: ${error}`);
    });

    void (async () => {
      const currentWindow = getCurrentWebviewWindow();
      // The window exists (hidden) from startup, so capture starts on open only.
      const unlisten = await currentWindow.listen("traffic:open", () => {
        void load();
      });
      if (disposed) unlisten();
      else unlistenOpen = unlisten;
      if (await currentWindow.isVisible()) void load();
      else setBusy(false);
    })().catch((error) => {
      setBusy(false);
      setFailure(String(error));
    });

    onCleanup(() => {
      unlistenOpen?.();
      unlistenStatus?.();
    });
  });

  onCleanup(() => {
    disposed = true;
    stopPolling();
    void stopTrafficCapture().catch(() => {});
  });

  const statusText = () => {
    if (busy()) return "Starting capture…";
    if (failure()) return null;
    const current = capture();
    if (current?.active) {
      return `Observing IP traffic on ${current.interface}`;
    }
    if (interfaces().length === 0) {
      return "No interface available to capture on";
    }
    return "Choose an interface to start observing";
  };

  const emptyHint = () => {
    if (!capture()?.active) return null;
    const current = frame();
    if (!current || current.observed_seconds === 0) {
      return "Collecting traffic…";
    }
    if (current.endpoints.length === 0) return "No traffic observed yet";
    return null;
  };

  const endpointSummary = () => {
    const current = frame();
    if (!capture()?.active || !current || current.endpoints.length === 0) {
      return null;
    }
    const listed = current.endpoints.length;
    const omitted = current.omitted_endpoints;
    const noun = listed + omitted === 1 ? "endpoint" : "endpoints";
    return omitted > 0
      ? `${listed + omitted} ${noun}, ${omitted} quietest not shown`
      : `${listed} ${noun}`;
  };

  // Rates outside the globe, so the plot itself stays free of text.
  const rateCaption = () => {
    const current = rates();
    if (!capture()?.active || !current || observedSeconds() === 0) return null;
    const approximate = gap() ? "~" : "";
    return `Sent ${approximate}${
      formatRate(current.sent)
    } · Received ${approximate}${formatRate(current.received)}`;
  };

  return (
    <div class="system-window flex h-screen w-full flex-col bg-bg-primary">
      <header class="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="text-xs text-text-secondary">Interface</span>
          <Dropdown
            size="sm"
            options={interfaces()}
            value={selected()}
            itemToString={(entry) => entry.name}
            onChange={(entry) => void startCapture(entry.id)}
            disabled={busy() || interfaces().length === 0}
            placeholder="None"
          />
        </div>

        <Show when={rateCaption()}>
          {(caption) => (
            <span class="ml-auto text-xs text-text-secondary">
              {caption()}{" "}
              <span class="text-text-muted">
                · {observedSeconds()} s avg
              </span>
            </span>
          )}
        </Show>
      </header>

      <Show when={failure()}>
        {(message) => (
          <div class="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
            <span class="text-sm text-text-red">{message()}</span>
            <button
              type="button"
              class="rounded-lg bg-accent px-3 py-1 text-sm text-accent-text hover:bg-accent-hover"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        )}
      </Show>

      <div class="relative flex flex-1 flex-col overflow-hidden">
        <Show when={busy()}>
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary/60">
            <Spinner class="h-6 w-6 text-text-secondary" />
          </div>
        </Show>
        <TrafficGlobe
          class="h-full w-full"
          endpoints={endpoints()}
          observedSeconds={observedSeconds()}
          exit={exit()}
        />
      </div>

      <footer class="flex items-center justify-between gap-4 border-t border-border px-4 py-2 text-xs text-text-secondary">
        <span>
          {emptyHint() ?? statusText() ?? "Capture unavailable"}
          <Show when={endpointSummary()}>
            {(summary) => (
              <span class="ml-1 text-text-muted">· {summary()}</span>
            )}
          </Show>
          <Show when={endpointSummary()}>
            <span class="ml-3 inline-flex items-center gap-1 text-text-muted">
              <span
                class="inline-block h-2 w-2 rounded-full bg-globe-hopr ring-1 ring-globe-hopr-edge"
                aria-hidden="true"
              />
              HOPR node
              <span
                class="ml-2 inline-block h-2 w-2 rounded-full bg-globe-link"
                aria-hidden="true"
              />
              Other
              <Show when={exit()}>
                <span
                  class="ml-2 inline-block h-2 w-2 rounded-full bg-globe-destination ring-2 ring-bg-primary"
                  aria-hidden="true"
                />
                Exit
              </Show>
              <Show when={endpoints().some((endpoint) => endpoint.tunnel)}>
                <span
                  class="ml-2 inline-block h-2 w-2 rounded-full bg-globe-destination"
                  aria-hidden="true"
                />
                Destination
              </Show>
            </span>
          </Show>
        </span>
        <Show when={gap() && capture()?.active}>
          <span class="text-text-yellow">
            Some traffic data was not received
          </span>
        </Show>
      </footer>
    </div>
  );
}
