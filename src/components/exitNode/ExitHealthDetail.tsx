import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import type {
  DestinationState,
  RouteHealthView,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import {
  formatExitHealthStatus,
  formatLatency,
  formatLoadAvg,
  formatRouting,
  formatSecondsAgo,
  formatSlots,
  getConnectionState,
  getExitHealthColor,
  getHopCount,
  getLastCheckedEpoch,
  type HealthColor,
} from "@src/utils/exitHealth.ts";
import HopsIcon from "./HopsIcon.tsx";
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
 * Displays latency, capacity, load, routing, and error info.
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
  const slots = () => {
    const rh = routeHealth();
    return rh ? formatSlots(rh) : null;
  };
  const loadAvg = () => {
    const rh = routeHealth();
    return rh ? formatLoadAvg(rh) : null;
  };
  const route = () => formatRouting(routing());
  // Stats (latency, capacity, load) only mean anything once the route is
  // actually usable — everything else (checking, needs channel/peer,
  // unreachable, ...) only ever gets a one-line status, no numbers, no
  // expand affordance. This also means the panel auto-collapses to that
  // status line if health degrades mid-expansion, and auto-restores the
  // user's expand/collapse choice once it's usable again — the choice
  // itself is never touched, only whether it's honored right now.
  const isGoodState = () =>
    isConnected() || routeHealth()?.state.state === "ReadyToConnect";

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
        <span class="ml-1">{route()}</span>
      </Tag>
    </Show>
  );

  return (
    <Show when={destId()} keyed>
      {(_id: string) => (
        <div class="w-full text-xs fade-in-up relative pl-3">
          <Show
            when={isGoodState()}
            fallback={
              <div class="flex flex-wrap items-center gap-1.5">
                {hopsTag()}
                <Tag
                  value={status()}
                  class={`${statusColorClass[color()]} bg-bg-primary`}
                />
              </div>
            }
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Show
                  when={settings.showDetailedMetrics}
                  fallback={
                    <>
                      <Stat
                        label="Latency"
                        value={latency()}
                        valueClass="font-semibold text-text-primary"
                        tooltip={latencyTooltip()}
                      />
                      {hopsTag()}
                    </>
                  }
                >
                  {
                    /* 2 columns auto-wrap the 5 cells into 3 rows: latency+hops,
                      checked+capacity, load (alone). */
                  }
                  <div class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-2 text-text-secondary">
                    <Stat
                      label="Latency"
                      value={latency()}
                      valueClass="font-semibold text-text-primary"
                      tooltip={latencyTooltip()}
                    />
                    {
                      /* -ml-2 cancels the pill's own px-2, so its icon lines
                        up with Capacity's text below instead of the pill's
                        outline. */
                    }
                    <div class="-ml-2">{hopsTag()}</div>
                    <Stat
                      label="Checked"
                      value={lastChecked()}
                      valueClass="font-semibold text-text-primary"
                      tooltip={<span>Time since last health check</span>}
                    />
                    <Stat
                      label="Capacity"
                      value={slots()}
                      tooltip={<span>Available / total connection slots</span>}
                    />
                    {
                      /* col-span-2: Load is alone in its row, so it can use
                        the full row width instead of just the first column. */
                    }
                    <div class="col-span-2">
                      <Stat
                        label="Load"
                        value={loadAvg()}
                        valueClass="text-text-primary whitespace-nowrap"
                        tooltip={
                          <span>Server load average. Lower is better.</span>
                        }
                      />
                    </div>
                  </div>
                </Show>
              </div>
              <button
                type="button"
                aria-expanded={settings.showDetailedMetrics}
                aria-label="Toggle exit node details"
                // Lines up with ExitNodeListButton's icon above (destination
                // card's px-3 + button's px-7 + list icon's half-width, minus
                // this icon's own half-width), despite the two rows having
                // different edge insets.
                class="shrink-0 mr-[38px] text-text-secondary hover:cursor-pointer"
                onClick={() =>
                  void settingsActions.setShowDetailedMetrics(
                    !settings.showDetailedMetrics,
                  )}
              >
                <ChevronIcon
                  class={`w-4 h-3 transition-transform duration-200 ${
                    settings.showDetailedMetrics ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
