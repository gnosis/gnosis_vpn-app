import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import type {
  DestinationState,
  RouteHealthView,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import {
  formatConnectionStatus,
  formatExitHealthStatus,
  formatLatency,
  formatLoadAvg,
  formatRouting,
  formatSecondsAgo,
  getConnectionState,
  getExitHealthColor,
  getHopCount,
  getLastCheckedEpoch,
  type HealthColor,
} from "@src/utils/exitHealth.ts";
import HopsIcon from "./HopsIcon.tsx";
import SlotLoadStat from "./SlotLoadStat.tsx";
import Stat from "./Stat.tsx";
import Tag from "../common/Tag.tsx";
import ChevronIcon from "../common/ChevronIcon.tsx";

const statusColorClass: Record<HealthColor, string> = {
  green: "text-vpn-light-green",
  yellow: "text-vpn-yellow",
  red: "text-vpn-red",
  gray: "text-text-muted",
  default: "text-text-primary",
};

/** Expanded health detail panel below the location banner. */
export default function ExitHealthDetail(
  props: { destinationState: DestinationState },
) {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const routeHealth = createMemo((): RouteHealthView | null =>
    props.destinationState.route_health ?? null
  );
  const routing = (): number => props.destinationState.destination.routing;

  const destId = () => props.destinationState.destination.id;

  // Top-level app state owns the live connection label.
  const connectionLabel = () =>
    getConnectionState(
      destId(),
      appState.connected?.destination_id,
      appState.connecting?.destination_id,
      appState.reconnecting?.destination_id,
      appState.disconnecting,
    );
  const isConnected = () => connectionLabel() === "Connected";

  const color = (): HealthColor => {
    if (isConnected()) return "green";
    const rh = routeHealth();
    if (!rh) return "gray";
    return getExitHealthColor(rh);
  };
  const status = () => {
    if (isConnected()) return "Connected";
    const rh = routeHealth();
    if (!rh) return "Unavailable";
    return formatExitHealthStatus(rh);
  };
  const latency = () => {
    const rh = routeHealth();
    return rh ? formatLatency(rh) : null;
  };
  const loadAvg = () => {
    const rh = routeHealth();
    return rh ? formatLoadAvg(rh) : null;
  };
  const route = () => formatRouting(routing());
  // Only usable routes keep the full stats panel, including mid-connect transitions.
  const isActionInFlight = () =>
    connectionLabel() === "Connecting" || connectionLabel() === "Reconnecting";
  const isGoodState = () =>
    isConnected() || isActionInFlight() ||
    routeHealth()?.state.state === "ReadyToConnect";

  // Own clock: this panel mounts separately from ExitNodeList.
  const [nowSec, setNowSec] = createSignal(Date.now() / 1000);
  const tick = setInterval(() => setNowSec(Date.now() / 1000), 1000);
  onCleanup(() => clearInterval(tick));

  const lastChecked = (): string | null => {
    const rh = routeHealth();
    if (!rh) return null;
    const epoch = getLastCheckedEpoch(rh);
    if (epoch === null) return null;
    const diff = Math.max(0, Math.round(nowSec() - epoch));
    return formatSecondsAgo(diff);
  };

  // Return fresh nodes; sharing one JSX node between layouts is unsafe.
  const latencyTooltip = () => (
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

  // Reuse the hop pill so it stays beside the active status row.
  const hopsTag = () => (
    <Show when={route() && getHopCount(routing()) !== 1}>
      <Tag>
        <HopsIcon count={getHopCount(routing())} hideCount />
        {
          /* Keep "2-hops" on one line beside Status. */
        }
        <span class="ml-1 whitespace-nowrap">{route()}</span>
      </Tag>
    </Show>
  );

  const connectionStatus = () => formatConnectionStatus(connectionLabel());
  const connectionStatusClass = () =>
    connectionStatus() === "Connected"
      ? "font-semibold text-vpn-light-green"
      : "font-semibold text-text-primary";

  // Use separately measured max-heights because WebKitGTK misrenders 0fr/1fr collapse and nested reads race.
  let latencyRowRef: HTMLDivElement | undefined;
  let detailedStatsRef: HTMLDivElement | undefined;
  let fallbackRowRef: HTMLDivElement | undefined;
  const [latencyRowHeightPx, setLatencyRowHeightPx] = createSignal(0);
  const [detailedStatsHeightPx, setDetailedStatsHeightPx] = createSignal(0);
  const [fallbackRowHeightPx, setFallbackRowHeightPx] = createSignal(0);
  const goodRowHeightPx = () =>
    latencyRowHeightPx() +
    (settings.showDetailedMetrics ? detailedStatsHeightPx() : 0);

  createEffect(() => {
    latency();
    route();
    connectionLabel();
    if (latencyRowRef) setLatencyRowHeightPx(latencyRowRef.scrollHeight);
  });
  createEffect(() => {
    lastChecked();
    routeHealth();
    loadAvg();
    if (detailedStatsRef) {
      setDetailedStatsHeightPx(detailedStatsRef.scrollHeight);
    }
  });
  createEffect(() => {
    route();
    status();
    if (fallbackRowRef) setFallbackRowHeightPx(fallbackRowRef.scrollHeight);
  });

  // The whole lower row toggles the detailed panel in good states.
  const toggleDetailedMetrics = () =>
    void settingsActions.setShowDetailedMetrics(!settings.showDetailedMetrics);

  return (
    <Show when={destId()} keyed>
      {(_id: string) => (
        <div
          class={`w-full text-xs fade-in-up relative pl-3 ${
            isGoodState() ? "cursor-pointer" : ""
          }`}
          role={isGoodState() ? "button" : undefined}
          tabIndex={isGoodState() ? 0 : undefined}
          aria-expanded={isGoodState()
            ? settings.showDetailedMetrics
            : undefined}
          aria-label={isGoodState() ? "Toggle exit node details" : undefined}
          onClick={() => isGoodState() && toggleDetailedMetrics()}
          onKeyDown={(e) => {
            if (!isGoodState()) return;
            if (e.key === "Enter" && !e.repeat) toggleDetailedMetrics();
            if (e.key === " ") e.preventDefault(); // prevent scroll; activate on keyup
          }}
          onKeyUp={(e) => {
            if (isGoodState() && e.key === " ") toggleDetailedMetrics();
          }}
        >
          {
            /* Keep both branches mounted; unmounting leaves no DOM to animate. */
          }
          <div>
            <div
              class="overflow-hidden flex items-center justify-between gap-2 transition-[max-height] duration-300 ease-out"
              style={{
                "max-height": isGoodState() ? `${goodRowHeightPx()}px` : "0px",
              }}
            >
              {
                /* Fix the 3fr/2fr split to panel width so columns stay put. */
              }
              <div class="min-w-0 flex-1">
                {
                  /* Match the detailed grid's columns. */
                }
                {
                  /* minmax(0, …) stops long values from widening a column. */
                }
                <div
                  ref={latencyRowRef}
                  class="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-4"
                >
                  <div class="flex items-center gap-2">
                    <Stat
                      label="Latency"
                      value={latency()}
                      valueClass="font-semibold text-text-primary"
                      tooltip={latencyTooltip()}
                    />
                    {hopsTag()}
                  </div>
                  <Show when={connectionStatus() !== "Disconnected"}>
                    <span class={`self-center ${connectionStatusClass()}`}>
                      {/* visible "Status" label was dropped by design; keep it for screen readers */}
                      <span class="sr-only">Connection status:</span>
                      {connectionStatus()}
                    </span>
                  </Show>
                </div>
                <div
                  ref={detailedStatsRef}
                  class="overflow-hidden transition-[max-height] duration-300 ease-out"
                  style={{
                    "max-height": settings.showDetailedMetrics
                      ? `${detailedStatsHeightPx()}px`
                      : "0px",
                  }}
                >
                  <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-4 gap-y-2 pt-2 text-text-secondary">
                    <div
                      class="transition-all duration-300 ease-out"
                      style={{
                        opacity: settings.showDetailedMetrics ? 1 : 0,
                        transform: settings.showDetailedMetrics
                          ? "translateY(0)"
                          : "translateY(-4px)",
                        "transition-delay": settings.showDetailedMetrics
                          ? "80ms"
                          : "0ms",
                      }}
                    >
                      <Stat
                        label="Checked"
                        value={lastChecked()}
                        valueClass="font-semibold text-text-primary"
                        tooltip={<span>Time since last health check</span>}
                      />
                    </div>
                    <div
                      class="transition-all duration-300 ease-out"
                      style={{
                        opacity: settings.showDetailedMetrics ? 1 : 0,
                        transform: settings.showDetailedMetrics
                          ? "translateY(0)"
                          : "translateY(-4px)",
                        "transition-delay": settings.showDetailedMetrics
                          ? "80ms"
                          : "0ms",
                      }}
                    >
                      <SlotLoadStat routeHealth={routeHealth()} />
                    </div>
                    <div
                      class="col-span-2 transition-all duration-300 ease-out"
                      style={{
                        opacity: settings.showDetailedMetrics ? 1 : 0,
                        transform: settings.showDetailedMetrics
                          ? "translateY(0)"
                          : "translateY(-4px)",
                        "transition-delay": settings.showDetailedMetrics
                          ? "160ms"
                          : "0ms",
                      }}
                    >
                      <Stat
                        label="CPU Utilization"
                        value={loadAvg()}
                        valueClass="text-text-primary whitespace-nowrap"
                        tooltip={
                          <span>Server load average. Lower is better.</span>
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
              {
                /* Decorative: the outer row handles toggling. */
              }
              {/* Align with the list button icon above. */}
              <span class="shrink-0 mr-[38px] text-text-secondary">
                <ChevronIcon
                  class={`w-4 h-3 transition-transform duration-200 ${
                    settings.showDetailedMetrics ? "rotate-180" : ""
                  }`}
                />
              </span>
            </div>
            <div
              ref={fallbackRowRef}
              class="overflow-hidden flex flex-wrap items-center gap-1.5 -ml-2 transition-[max-height] duration-300 ease-out"
              style={{
                "max-height": isGoodState()
                  ? "0px"
                  : `${fallbackRowHeightPx()}px`,
              }}
            >
              {
                /* -ml-2 cancels the leading pill's own px-2, so its text
                  lines up with the flag/label above instead of the
                  pill's outline. */
              }
              {hopsTag()}
              <Tag
                value={status()}
                class={`${statusColorClass[color()]} bg-bg-primary`}
              />
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
