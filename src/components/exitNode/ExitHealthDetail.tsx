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
};

/**
 * Expanded health detail panel shown below the location banner.
 * Displays latency, load, CPU Utilization, routing, and error info.
 */
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

  // Derive connection label from top-level app state instead of per-destination field
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
  // Stats (latency, load, CPU Utilization) only mean anything once the route is
  // actually usable — everything else (checking, needs channel/peer,
  // unreachable, ...) only ever gets a one-line status, no numbers, no
  // expand affordance. This also means the panel auto-collapses to that
  // status line if health degrades mid-expansion, and auto-restores the
  // user's expand/collapse choice once it's usable again — the choice
  // itself is never touched, only whether it's honored right now.
  // Connecting/Reconnecting (an action in flight for this destination) is
  // deliberately a good state: the Status stat next to Latency reports the
  // transition, and an open stats dropdown stays open through it instead of
  // collapsing to the one-line fallback. Disconnecting is excluded: it's
  // treated as already disconnected here.
  const isActionInFlight = () =>
    connectionLabel() === "Connecting" || connectionLabel() === "Reconnecting";
  const isGoodState = () =>
    isConnected() || isActionInFlight() ||
    routeHealth()?.state.state === "ReadyToConnect";

  // Independent clock: ExitHealthDetail is mounted in MainScreen, outside ExitNodeList
  // which runs its own clock. Both are intentionally separate mounts.
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

  // A function (not a shared JSX value) so the collapsed and expanded
  // layouts each get their own node — they never render together, but
  // Solid's JSX nodes aren't safe to hand to two spots at once regardless.
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

  // Shared between the good and fallback layouts so the hop count always
  // sits next to whatever status/latency info is showing, not stacked above it.
  const hopsTag = () => (
    <Show when={route() && getHopCount(routing()) !== 1}>
      <Tag>
        <HopsIcon count={getHopCount(routing())} hideCount />
        {
          /* nowrap: "2-hops" would otherwise break at the hyphen now that
          the pill shares its column with the Status stat */
        }
        <span class="ml-1 whitespace-nowrap">{route()}</span>
      </Tag>
    </Show>
  );

  // Connection status shown beside Latency, colored like the fallback tag:
  // green while connected, yellow during a transition, plain otherwise.
  const connectionStatus = () => formatConnectionStatus(connectionLabel());
  const connectionStatusClass = () => {
    const s = connectionStatus();
    if (s === "Connected") return "font-semibold text-vpn-light-green";
    if (s === "Connecting") return "font-semibold text-vpn-yellow";
    return "font-semibold text-text-primary";
  };

  // The good/fallback swap below and the Checked/Load/CPU Utilization panel used to
  // collapse via a "grid-template-rows: 1fr 0fr" trick, animating between an
  // 0fr and 1fr row on an auto-height parent. Chromium resolves that fine,
  // but the app's real webview (WebKitGTK on Linux) doesn't reliably shrink
  // the 0fr row to zero there, leaving the panel pinned open — a headless
  // Chromium-only test can't catch this since it's an engine difference, not
  // a logic bug. Measuring each block's own natural height via scrollHeight
  // and transitioning max-height between concrete pixel values sidesteps the
  // ambiguity entirely: every engine agrees on what a definite max-height
  // transition should do.
  // goodRowRef nests detailedStatsRef, which is itself max-height-animated —
  // measuring goodRowRef's own scrollHeight would race against that child's
  // DOM commit (a parent's scrollHeight reflects a clamped child's *current*
  // rendered height, not its natural one). Measure the two parts
  // independently instead and sum them; that's plain arithmetic, no race.
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

  // The whole area south of the destination card toggles expand/collapse,
  // not just the chevron — a bigger, more forgiving click/tap target. Only
  // wired up in the good state: the fallback view has nothing to toggle.
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
            /* Both branches stay mounted (never swapped via <Show>'s
              unmount/mount) so the good-state/fallback height change can
              animate — a <Show> swap has nothing left to clip once the old
              branch is gone. Each one's own max-height (not a shared grid)
              drives the collapse; see the scrollHeight effects above. */
          }
          <div>
            <div
              class="overflow-hidden flex items-center justify-between gap-2 transition-[max-height] duration-300 ease-out"
              style={{
                "max-height": isGoodState() ? `${goodRowHeightPx()}px` : "0px",
              }}
            >
              {
                /* flex-1: fill the row so the grids' 3fr/2fr split is fixed
                  by the panel width, not by whatever text happens to be
                  rendered — otherwise Status/Load shift sideways whenever
                  latency or the status label changes width. */
              }
              <div class="min-w-0 flex-1">
                {
                  /* Same column split as the detailed grid below, so Status
                    lines up above Load and Latency above Checked. */
                }
                {
                  /* minmax(0,…): the split is a pure ratio of the panel
                    width, never pushed by whatever text is in a column, so
                    the columns hold still across connect/disconnect. */
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
                  <Stat
                    label="Status"
                    value={connectionStatus()}
                    valueClass={connectionStatusClass()}
                    tooltip={<span>State of the connection</span>}
                  />
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
                /* Decorative now — the whole row above is the real toggle
                  control; see aria-expanded/aria-label on the outer div. */
              }
              <span // Lines up with ExitNodeListButton's icon above (destination
               // card's px-3 + button's px-7 + list icon's half-width, minus
              // this icon's own half-width), despite the two rows having
              // different edge insets.
              class="shrink-0 mr-[38px] text-text-secondary">
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
