import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import type {
  DestinationState,
  RouteHealthView,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { getExitData } from "@src/utils/destinations.ts";
import {
  type ConnectionQuality,
  formatExitHealthStatus,
  formatLatency,
  formatPathValue,
  formatRelays,
  formatRouting,
  formatSecondsAgo,
  getConnectionQuality,
  getConnectionState,
  getExitHealthColor,
  getHopCount,
  getLastCheckedEpoch,
  getLatencyLevel,
  getLatencyMs,
  getRouteVerdict,
  getSlotLoad,
  getSlotLoadLevel,
  type HealthColor,
} from "@src/utils/exitHealth.ts";
import { levelValueClass } from "../exitNode/levelColor.ts";
import HopsIcon from "../exitNode/HopsIcon.tsx";
import StalledTag from "../exitNode/StalledTag.tsx";
import WeakRouteTag from "../exitNode/WeakRouteTag.tsx";
import ChevronIcon from "../common/ChevronIcon.tsx";
import Tag from "../common/Tag.tsx";
import Tooltip from "../common/Tooltip.tsx";
import QualityBars, { type BarTone } from "./QualityBars.tsx";

// Module scope: the choice survives screen switches and resets on app restart.
const [expanded, setExpanded] = createSignal(false);

const statusColorClass: Record<HealthColor, string> = {
  green: "text-text-green",
  yellow: "text-text-yellow",
  red: "text-text-red",
  gray: "text-text-muted",
  default: "text-text-primary",
};

const QUALITY: Record<
  ConnectionQuality,
  { text: string; bars: number; tone: BarTone; class: string }
> = {
  good: { text: "Good", bars: 3, tone: "green", class: "text-text-green" },
  fair: { text: "Fair", bars: 2, tone: "amber", class: "text-text-orange" },
  poor: { text: "Poor", bars: 1, tone: "red", class: "text-text-red" },
};

const LATENCY_TOOLTIP = (
  <div class="space-y-1">
    <p class="text-white font-bold">Expected ~200ms</p>
    <div class="flex items-center gap-1.5">
      <span class="text-vpn-light-green">&#9660;</span>
      <span>Lower is better</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="text-vpn-red">&#9650;</span>
      <span>Higher is worse</span>
    </div>
  </div>
);
const CHECKED_TOOLTIP = "Time since last health check";
const PATH_TOOLTIP =
  "Value of the best path found; below 90% counts as a weak route.";
const RELAYS_TOOLTIP =
  "Distinct first relays over the paths found; more means fewer single points of failure.";
const ROUTE_TOOLTIP =
  "How many HOPR relays each packet passes on its way to the exit.";

/** A label whose explanation shows on hover, with no visible icon. */
function Label(props: { text: string; tooltip: JSX.Element }) {
  return (
    <Tooltip content={props.tooltip} position="top">
      <span class="cursor-help">{props.text}</span>
    </Tooltip>
  );
}

function Metric(props: {
  label: string;
  tooltip: JSX.Element;
  value: string | null;
  valueClass: string;
}) {
  return (
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="text-[11px] text-text-muted">
        <Label text={props.label} tooltip={props.tooltip} />
      </span>
      <span
        class={`mt-0.5 text-lg font-bold leading-tight ${
          props.value === null ? "text-text-muted" : props.valueClass
        }`}
      >
        {props.value ?? "–"}
      </span>
    </div>
  );
}

function DiagnosticRow(props: {
  label: string;
  tooltip: JSX.Element;
  value: string | null;
}) {
  return (
    <div class="flex items-center justify-between gap-3 py-1 text-xs">
      <span class="text-text-muted">
        <Label text={props.label} tooltip={props.tooltip} />
      </span>
      <span
        class={`tabular-nums ${
          props.value === null ? "text-text-muted" : "text-text-primary"
        }`}
      >
        {props.value ?? "–"}
      </span>
    </div>
  );
}

/** One card for the active destination: a verdict row, and the numbers behind it on request. */
export default function StatusCard(
  props: { destinationState: DestinationState },
) {
  const [appState] = useAppStore();

  const destId = () => props.destinationState.destination.id;
  const routeHealth = createMemo((): RouteHealthView | null =>
    props.destinationState.route_health ?? null
  );
  const exit = createMemo(() =>
    getExitData(props.destinationState, appState.probe)
  );
  const connectionState = () =>
    getConnectionState(
      destId(),
      appState.connected?.destination_id,
      appState.connecting?.destination_id,
      appState.reconnecting?.destination_id,
      appState.disconnecting,
    );
  const isConnected = () => connectionState() === "Connected";
  const inFlight = () =>
    connectionState() === "Connecting" || connectionState() === "Reconnecting";
  const stall =
    () => (isConnected() ? appState.connected?.stall ?? null : null);
  // The tunnel's own sample once we are connected through this exit.
  const tunnelRtt = () =>
    isConnected() ? appState.connected?.tunnel_ping_rtt ?? null : null;

  const latencyMs = () => getLatencyMs(exit(), tunnelRtt());
  const latency = () => formatLatency(exit(), tunnelRtt());
  const latencyClass = () => {
    const ms = latencyMs();
    return ms === null ? "" : levelValueClass(getLatencyLevel(ms));
  };
  const load = createMemo(() => getSlotLoad(exit()));
  const loadLevel = () => {
    const l = load();
    return l ? getSlotLoadLevel(l.percent) : null;
  };
  const loadValue = () => {
    const l = load();
    return l ? `${l.percent}%` : null;
  };
  const loadClass = () => {
    const level = loadLevel();
    return level ? levelValueClass(level) : "";
  };
  const loadTooltip = () => {
    const l = load();
    return `Connection slots in use${
      l ? ` (${l.used} of ${l.total})` : ""
    }. Lower is better.`;
  };

  const quality = () => getConnectionQuality(latencyMs(), loadLevel(), stall());
  // The walk's own verdict, not isWeakRoute: a destination still being checked is not weak yet.
  const isWeak = () => {
    const rh = routeHealth();
    return rh !== null && getRouteVerdict(rh, exit()) === "weak";
  };
  const hopCount = () =>
    getHopCount(props.destinationState.destination.routing);

  // Own clock: "Last checked" has to age between status updates.
  const [nowSec, setNowSec] = createSignal(Date.now() / 1000);
  const tick = setInterval(() => setNowSec(Date.now() / 1000), 1000);
  onCleanup(() => clearInterval(tick));
  const lastChecked = (): string | null => {
    const rh = routeHealth();
    if (!rh) return null;
    const epoch = getLastCheckedEpoch(rh, exit());
    if (epoch === null) return null;
    return formatSecondsAgo(Math.max(0, Math.round(nowSec() - epoch)));
  };
  const pathValue = () => {
    const rh = routeHealth();
    return rh ? formatPathValue(rh) : null;
  };
  const relays = () => {
    const rh = routeHealth();
    return rh ? formatRelays(rh) : null;
  };

  // The collapsed row: what the bars show and what the label says.
  const row = createMemo(() => {
    if (isConnected()) {
      const q = QUALITY[quality()];
      return {
        prefix: "Connection quality:",
        text: q.text,
        class: q.class,
        bars: q.bars,
        tone: q.tone,
        pulsing: false,
      };
    }
    if (inFlight()) {
      return {
        prefix: "Network status:",
        text: "Connecting…",
        class: "text-text-yellow",
        bars: 0,
        tone: "muted" as BarTone,
        pulsing: true,
      };
    }
    const rh = routeHealth();
    if (!rh) {
      return {
        prefix: "Network status:",
        text: "Unavailable",
        class: statusColorClass.gray,
        bars: 0,
        tone: "muted" as BarTone,
        pulsing: false,
      };
    }
    const verdict = getRouteVerdict(rh, exit());
    const bars = verdict === "ready" ? 3 : verdict === "weak" ? 1 : 0;
    const tone: BarTone = verdict === "ready" ? "green" : "amber";
    return {
      prefix: "Network status:",
      text: formatExitHealthStatus(rh, exit()),
      class: statusColorClass[getExitHealthColor(rh, exit())],
      bars,
      tone,
      pulsing: verdict === "checking",
    };
  });

  // Measured max-height rather than 0fr/1fr: WebKitGTK misrenders the grid collapse.
  let panelRef: HTMLDivElement | undefined;
  const [panelHeightPx, setPanelHeightPx] = createSignal(0);
  createEffect(() => {
    latency();
    loadValue();
    lastChecked();
    relays();
    pathValue();
    if (panelRef) setPanelHeightPx(panelRef.scrollHeight);
  });

  const toggle = () => setExpanded((open) => !open);

  return (
    <Show when={destId()} keyed>
      {(_id: string) => (
        <section class="w-full overflow-hidden rounded-xl border border-border bg-bg-surface text-xs">
          {/* A div, not a button: the tags inside carry their own focusable tooltips. */}
          <div
            role="button"
            tabIndex={0}
            aria-expanded={expanded()}
            aria-label={`${row().prefix} ${row().text}. Toggle details`}
            class="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            onClick={toggle}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.repeat) toggle();
              if (e.key === " ") e.preventDefault(); // activate on keyup, never scroll
            }}
            onKeyUp={(e) => {
              if (e.key === " ") toggle();
            }}
          >
            <span class="flex min-w-0 items-center gap-2">
              <QualityBars
                filled={row().bars}
                tone={row().tone}
                pulsing={row().pulsing}
                label={`${row().prefix} ${row().text}`}
              />
              <span class="truncate text-text-secondary">
                {row().prefix}{" "}
                <span class={`font-bold ${row().class}`}>{row().text}</span>
              </span>
              <Show when={stall()}>{(s) => <StalledTag stall={s()} />}</Show>
              <Show when={!isConnected() && isWeak()}>
                <WeakRouteTag />
              </Show>
              <Show when={hopCount() !== 1}>
                <Tag>
                  <HopsIcon count={hopCount()} hideCount />
                  <span class="ml-1 whitespace-nowrap">
                    {formatRouting(props.destinationState.destination.routing)}
                  </span>
                </Tag>
              </Show>
            </span>
            <span class="text-text-secondary">
              <ChevronIcon
                class={`h-2.5 w-3.5 transition-transform duration-200 ${
                  expanded() ? "rotate-180" : ""
                }`}
              />
            </span>
          </div>
          <div
            class="overflow-hidden transition-[max-height] duration-300 ease-out"
            style={{
              "max-height": expanded() ? `${panelHeightPx()}px` : "0px",
            }}
            aria-hidden={!expanded()}
          >
            <div ref={panelRef}>
              <div class="mx-3.5 flex border-b border-border pb-3">
                <Metric
                  label="Latency"
                  tooltip={LATENCY_TOOLTIP}
                  value={latency()}
                  valueClass={latencyClass()}
                />
                <div class="ml-4 flex min-w-0 flex-1 border-l border-border pl-4">
                  <Metric
                    label="Server load"
                    tooltip={<span>{loadTooltip()}</span>}
                    value={loadValue()}
                    valueClass={loadClass()}
                  />
                </div>
              </div>
              <div class="px-3.5 pb-3 pt-2.5">
                <h2 class="mb-0.5 text-[11px] font-bold text-text-muted">
                  Diagnostics
                </h2>
                <DiagnosticRow
                  label="Last checked"
                  tooltip={<span>{CHECKED_TOOLTIP}</span>}
                  value={lastChecked()}
                />
                <DiagnosticRow
                  label="Path"
                  tooltip={<span>{PATH_TOOLTIP}</span>}
                  value={pathValue()}
                />
                <DiagnosticRow
                  label={isConnected() ? "Relays" : "Relays available"}
                  tooltip={<span>{RELAYS_TOOLTIP}</span>}
                  value={relays()}
                />
                <DiagnosticRow
                  label="Route"
                  tooltip={<span>{ROUTE_TOOLTIP}</span>}
                  value={formatRouting(
                    props.destinationState.destination.routing,
                  )
                    .replace("-", " ")}
                />
              </div>
            </div>
          </div>
        </section>
      )}
    </Show>
  );
}
