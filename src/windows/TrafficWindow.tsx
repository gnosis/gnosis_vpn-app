import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import TrafficCanvas from "@src/components/traffic/TrafficCanvas.tsx";
import SegmentedControlSwitcher from "@src/components/common/SegmentedControlSwitcher.tsx";
import { Dropdown } from "@src/components/common/Dropdown.tsx";
import Spinner from "@src/components/common/Spinner.tsx";
import Tooltip from "@src/components/common/Tooltip.tsx";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
import {
  type CaptureStatus,
  DEFAULT_TIMEFRAME_SECONDS,
  fetchTrafficFrame,
  listTrafficInterfaces,
  MAX_TIMEFRAME_SECONDS,
  MIN_TIMEFRAME_SECONDS,
  parseTimeframe,
  startTrafficCapture,
  stopTrafficCapture,
  TIMEFRAME_PRESETS,
  TRAFFIC_ROW_HEIGHT,
  type TrafficFrame,
  type TrafficInterface,
} from "@src/services/trafficService.ts";

/** Frame cadence; one request is in flight at a time. */
const FRAME_INTERVAL_MS = 100;

const PRESET_OPTIONS = TIMEFRAME_PRESETS.map((seconds) => ({
  value: String(seconds),
  label: `${seconds}s`,
}));

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function TrafficWindow() {
  const [interfaces, setInterfaces] = createSignal<TrafficInterface[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [timeframe, setTimeframe] = createSignal(DEFAULT_TIMEFRAME_SECONDS);
  const [customTimeframe, setCustomTimeframe] = createSignal("");
  const [customInvalid, setCustomInvalid] = createSignal(false);
  const [frame, setFrame] = createSignal<TrafficFrame | null>(null);
  const [capture, setCapture] = createSignal<CaptureStatus | null>(null);
  const [firstRow, setFirstRow] = createSignal(0);
  const [areaHeight, setAreaHeight] = createSignal(0);
  const [busy, setBusy] = createSignal(true);
  const [failure, setFailure] = createSignal<string | null>(null);
  const [gap, setGap] = createSignal(false);

  let disposed = false;
  let polling = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let areaRef: HTMLDivElement | undefined;

  const selected = createMemo(() =>
    interfaces().find((entry) => entry.id === selectedId()) ?? null
  );
  // Both panes share one row mapping, so the row count comes from the area.
  const rowsPerPane = createMemo(() =>
    Math.max(
      1,
      Math.floor((areaHeight() - 1) / 2 / TRAFFIC_ROW_HEIGHT),
    )
  );
  const maxFirstRow = createMemo(() =>
    Math.max(0, (frame()?.total_rows ?? 0) - rowsPerPane())
  );

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
      const response = await fetchTrafficFrame(
        timeframe(),
        firstRow(),
        rowsPerPane(),
      );
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
    setFirstRow(0);
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

  const applyCustomTimeframe = () => {
    const parsed = parseTimeframe(customTimeframe());
    if (parsed === null) {
      setCustomInvalid(true);
      return;
    }
    setCustomInvalid(false);
    setTimeframe(parsed);
  };

  // Keep the window anchored when retained history shrinks.
  createEffect(() => {
    const max = maxFirstRow();
    if (firstRow() > max) setFirstRow(max);
  });

  onMount(() => {
    let unlistenOpen: (() => void) | undefined;

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

    if (areaRef) {
      const resize = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect) setAreaHeight(rect.height);
      });
      resize.observe(areaRef);
      onCleanup(() => resize.disconnect());
    }

    onCleanup(() => unlistenOpen?.());
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

  const emptyHint = () =>
    capture()?.active && (frame()?.total_rows ?? 0) === 0
      ? "No traffic observed yet"
      : null;

  const diagnostics = () => {
    const current = frame();
    if (!current) return null;
    const parts = [`${current.timeframe_seconds} s window`];
    if (gap() || current.dropped_batches > 0) {
      parts.push("some data was dropped");
    }
    if (current.dropped_targets > 0) parts.push("target limit reached");
    return parts.join(" · ");
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

        <div class="flex items-center gap-2">
          <span class="text-xs text-text-secondary">Window</span>
          <SegmentedControlSwitcher
            options={PRESET_OPTIONS}
            value={String(timeframe())}
            onChange={(value) => setTimeframe(Number(value))}
            ariaLabel="Timeframe"
            disabled={busy()}
          />
          <input
            type="text"
            inputMode="numeric"
            class="w-16 rounded-lg border bg-bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
            classList={{
              "border-text-red": customInvalid(),
              "border-border": !customInvalid(),
            }}
            placeholder={`${MIN_TIMEFRAME_SECONDS}–${MAX_TIMEFRAME_SECONDS}`}
            aria-label="Custom window in seconds"
            value={customTimeframe()}
            disabled={busy()}
            onInput={(event) => {
              setCustomTimeframe(event.currentTarget.value);
              setCustomInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyCustomTimeframe();
            }}
            onBlur={applyCustomTimeframe}
          />
        </div>

        <div class="ml-auto flex items-center gap-4">
          <div class="flex items-center gap-3 text-xs text-text-secondary">
            <span class="flex items-center gap-1.5">
              <span class="h-2 w-4 rounded-sm bg-traffic-hopr" />
              HOPR-associated
            </span>
            <span class="flex items-center gap-1.5">
              <span class="h-2 w-4 rounded-sm bg-traffic-other" />
              Other
            </span>
          </div>
          <Tooltip
            position="bottom"
            content={
              <span>
                Blocks age from left to right in the upper pane and right to
                left in the lower one. HOPR-associated traffic goes to an
                address the node announced. The mixnet carries the tunnel, so
                inner VPN destinations and other VPNs cannot be attributed on
                this interface.
              </span>
            }
          >
            <span class="cursor-default text-xs text-text-muted underline decoration-dotted">
              About this view
            </span>
          </Tooltip>
        </div>
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
        <div
          ref={areaRef}
          class="flex h-full w-full flex-col"
          onWheel={(event) => {
            event.preventDefault();
            const step = Math.max(
              1,
              Math.round(Math.abs(event.deltaY) / TRAFFIC_ROW_HEIGHT),
            );
            const direction = event.deltaY > 0 ? step : -step;
            setFirstRow((current) =>
              clamp(current + direction, 0, maxFirstRow())
            );
          }}
        >
          <TrafficCanvas
            pane="upstream"
            frame={frame()}
            rows={rowsPerPane()}
            firstRow={firstRow()}
          />
          <div class="h-px w-full bg-border" />
          <TrafficCanvas
            pane="downstream"
            frame={frame()}
            rows={rowsPerPane()}
            firstRow={firstRow()}
          />
        </div>
      </div>

      <footer class="flex items-center justify-between gap-4 border-t border-border px-4 py-2 text-xs text-text-secondary">
        <span>
          {emptyHint() ?? statusText() ?? "Capture unavailable"}
        </span>
        <span>{diagnostics()}</span>
      </footer>
    </div>
  );
}
