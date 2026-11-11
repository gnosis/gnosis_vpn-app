import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import TrafficGlobe from "@src/components/traffic/TrafficGlobe.tsx";
import TrafficReadout from "@src/components/traffic/TrafficReadout.tsx";
import Spinner from "@src/components/common/Spinner.tsx";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
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
} from "@src/services/trafficService.ts";

/** Frame cadence; one request is in flight at a time. */
const FRAME_INTERVAL_MS = 100;

/** Live traffic beside the main screen; capture runs only while it is mounted, so every opening starts empty. */
export default function TrafficPane() {
  const [frame, setFrame] = createSignal<TrafficFrame | null>(null);
  const [capture, setCapture] = createSignal<CaptureStatus | null>(null);
  const [busy, setBusy] = createSignal(true);
  const [failure, setFailure] = createSignal<string | null>(null);
  const [gap, setGap] = createSignal(false);
  const [exit, setExit] = createSignal<ConnectedExit | null>(null);

  let disposed = false;
  let polling = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const live = () => capture()?.active === true;
  const endpoints = createMemo(() => {
    const all = frame()?.endpoints ?? [];
    // Tunnel destinations hang off the exit, so they go once it does.
    return exit() ? all : all.filter((endpoint) => !endpoint.tunnel);
  });
  const relayCount = createMemo(() =>
    endpoints().filter((endpoint) => endpoint.hopr_peer && !endpoint.tunnel)
      .length
  );
  const endpointCount = () =>
    endpoints().length + (frame()?.omitted_endpoints ?? 0);
  const observedSeconds = () => frame()?.observed_seconds ?? 0;
  const rates = createMemo(() => {
    const current = frame();
    return current && live() ? averageRates(current) : { sent: 0, received: 0 };
  });

  const stopPolling = () => {
    polling = false;
    clearTimeout(timer);
    timer = undefined;
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

  const start = async () => {
    stopPolling();
    setBusy(true);
    setFailure(null);
    setGap(false);
    setFrame(null);
    try {
      const list = await listTrafficInterfaces();
      if (disposed) return;
      // No picker in the pane: the default route's interface carries the traffic worth showing.
      const chosen = list.find((entry) => entry.is_default) ?? list[0];
      if (!chosen) {
        setFailure("No interface available to capture on");
        return;
      }
      // A previous session may still be running; the daemon replaces it anyway.
      await stopTrafficCapture().catch(() => {});
      const status = await startTrafficCapture(chosen.id);
      if (disposed) return;
      setCapture(status);
      if (!status.active) {
        setFailure(status.error ?? status.ended ?? "capture did not start");
        return;
      }
      logInfo(`traffic capture started on ${chosen.id}`);
      polling = true;
      void tick();
    } catch (error) {
      if (disposed) return;
      logWarn(`traffic capture failed to start: ${error}`);
      setFailure(String(error));
    } finally {
      if (!disposed) setBusy(false);
    }
  };

  onMount(() => {
    let unlistenStatus: (() => void) | undefined;
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
    void start();
    onCleanup(() => unlistenStatus?.());
  });

  onCleanup(() => {
    disposed = true;
    stopPolling();
    void stopTrafficCapture().catch(() => {});
  });

  const footerStatus = () => {
    if (busy()) return "Starting capture…";
    if (!live()) return "Capture stopped";
    if (observedSeconds() === 0) return "Collecting traffic…";
    const count = endpointCount();
    return `Observing IP traffic · ${count} ${
      count === 1 ? "endpoint" : "endpoints"
    }`;
  };

  return (
    <section
      aria-label="Live traffic"
      class="flex h-full w-full flex-col bg-bg-primary"
    >
      <header class="flex items-center justify-between gap-3 border-b border-border px-3.5 py-3">
        <span class="text-xs font-semibold text-text-primary">
          Live traffic
        </span>
        <span class="text-[11px] text-text-secondary">
          {observedSeconds() || frame()?.window_seconds || 10} s avg
        </span>
      </header>

      <div class="relative flex min-h-0 flex-1 flex-col px-2.5 pt-1.5">
        <Show when={busy()}>
          <div class="absolute inset-0 z-10 flex items-center justify-center">
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

      <TrafficReadout
        sent={rates().sent}
        received={rates().received}
        live={live()}
      />

      <footer class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-border px-3.5 pt-2.5 pb-3 text-[11px] text-text-secondary">
        <Show
          when={failure()}
          fallback={
            <>
              <span>{footerStatus()}</span>
              <span class="inline-flex items-center gap-1.5">
                <span
                  class="size-2 rounded-full bg-traffic-gt"
                  aria-hidden="true"
                />
                {relayCount()} HOPR {relayCount() === 1 ? "relay" : "relays"}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span
                  class="size-2 rounded-full bg-text-secondary"
                  aria-hidden="true"
                />
                Via VPN
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span
                  class="size-2 rounded-full bg-traffic-warn"
                  aria-hidden="true"
                />
                Not via VPN
              </span>
              <Show when={gap() && live()}>
                <span class="text-text-yellow">
                  Some traffic data was not received
                </span>
              </Show>
            </>
          }
        >
          {(message) => (
            <>
              <span class="min-w-0 flex-1 text-text-red">{message()}</span>
              <button
                type="button"
                class="rounded-lg bg-accent px-3 py-1 text-xs text-accent-text hover:bg-accent-hover"
                onClick={() => void start()}
              >
                Retry
              </button>
            </>
          )}
        </Show>
      </footer>
    </section>
  );
}
