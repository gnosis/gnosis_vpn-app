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

  // The hops pill lives in one spot next to Latency (collapsed) and a
  // different one aligned under Capacity (expanded) — two different
  // layouts, not two positions of the same one, so CSS alone can't tween
  // between them. Instead we measure both and slide the same DOM node with
  // a transform (a lightweight FLIP): capacityRef stays mounted at all
  // times (only its row's height animates), so its column position is
  // measurable even while collapsed.
  let hopsRef: HTMLDivElement | undefined;
  let capacityRef: HTMLDivElement | undefined;
  const [hopsOffsetPx, setHopsOffsetPx] = createSignal(0);
  const PILL_LEFT_PAD_PX = 8; // Tag's own px-2, canceled so the icon (not the pill's outline) lines up with Capacity

  createEffect(() => {
    const expanded = settings.showDetailedMetrics;
    latency(); // re-measure if the latency text's width changes
    if (!expanded || !hopsRef || !capacityRef) {
      setHopsOffsetPx(0);
      return;
    }
    const hopsLeft = hopsRef.getBoundingClientRect().left;
    const capacityLeft = capacityRef.getBoundingClientRect().left;
    setHopsOffsetPx(capacityLeft - PILL_LEFT_PAD_PX - hopsLeft);
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
          <Show
            when={isGoodState()}
            fallback={
              <div class="flex flex-wrap items-center gap-1.5 -ml-2">
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
            }
          >
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <Stat
                    label="Latency"
                    value={latency()}
                    valueClass="font-semibold text-text-primary"
                    tooltip={latencyTooltip()}
                  />
                  <div
                    ref={hopsRef}
                    class="transition-transform duration-300 ease-out"
                    style={{ transform: `translateX(${hopsOffsetPx()}px)` }}
                  >
                    {hopsTag()}
                  </div>
                </div>
                {
                  /* grid-template-rows 0fr->1fr is the standard CSS-only way
                    to animate a height nobody knows up front; the inner
                    overflow-hidden clips content out of the shrinking row. */
                }
                <div
                  class="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{
                    "grid-template-rows": settings.showDetailedMetrics
                      ? "1fr"
                      : "0fr",
                  }}
                >
                  <div class="overflow-hidden">
                    <div class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-2 pt-2 text-text-secondary">
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
                        ref={capacityRef}
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
                          label="Capacity"
                          value={slots()}
                          tooltip={
                            <span>Available / total connection slots</span>
                          }
                        />
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
                          label="Load"
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
          </Show>
        </div>
      )}
    </Show>
  );
}
