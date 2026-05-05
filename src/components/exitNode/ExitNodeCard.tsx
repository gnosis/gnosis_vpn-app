import { createMemo, Show } from "solid-js";
import type {
  DestinationState,
  RouteHealthView,
  RoutingOptions,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import {
  formatLatency,
  formatLoadAvg,
  formatRouting,
  formatSecondsAgo,
  formatSlots,
  getConnectionState,
  getHopCount,
  getLastCheckedEpoch,
  hasHealthContent,
  isReadyToConnect,
} from "@src/utils/exitHealth.ts";
import HopsIcon from "./HopsIcon.tsx";
import Stat from "./Stat.tsx";
import Tag from "../common/Tag.tsx";

export default function ExitNodeCard(props: {
  destinationState: () => DestinationState;
  isSelected: boolean;
  nowSec: () => number;
  onClick: () => void;
}) {
  const [appState] = useAppStore();
  const [settings] = useSettingsStore();

  const destId = () => props.destinationState().destination.id;
  const routeHealth = createMemo((): RouteHealthView | null =>
    props.destinationState().route_health ?? null
  );
  const routing = (): RoutingOptions =>
    props.destinationState().destination.routing;

  const connectionLabel = createMemo(() =>
    getConnectionState(
      destId(),
      appState.connected,
      appState.connecting?.destination_id,
      appState.disconnecting,
    )
  );
  const isConnected = () => connectionLabel() === "Connected";
  const isConnecting = () => connectionLabel() === "Connecting";
  const isDisconnecting = () => connectionLabel() === "Disconnecting";
  const leftBarColor = () => {
    if (isConnected() || isConnecting()) return "bg-vpn-light-green";
    if (props.isSelected) return "bg-text-muted";
    return null;
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
  const hopCount = () => getHopCount(routing());

  const lastChecked = (): string | null => {
    const rh = routeHealth();
    if (!rh) return null;
    const epoch = getLastCheckedEpoch(rh);
    if (epoch === null) return null;
    const diff = Math.max(0, Math.round(props.nowSec() - epoch));
    return formatSecondsAgo(diff);
  };

  // Allow click on active/transitioning nodes to acknowledge selection,
  // bypassing the health check since the tunnel is already established.
  const isClickable = () =>
    isReadyToConnect(routeHealth() ?? undefined) || isConnected() ||
    isConnecting() || isDisconnecting();

  return (
    <div
      class={`relative flex w-full bg-bg-surface-alt text-xs transition-opacity ${
        !isClickable()
          ? "opacity-40 pointer-events-none"
          : "cursor-pointer hover:bg-bg-surface"
      }`}
      onClick={isClickable() ? () => props.onClick() : undefined}
      onKeyDown={isClickable()
        ? (e) => e.key === "Enter" && props.onClick()
        : undefined}
      role={isClickable() ? "button" : undefined}
      tabIndex={isClickable() ? 0 : undefined}
    >
      <Show when={leftBarColor()}>
        {(color) => (
          <div
            class={`absolute inset-y-0 left-0 w-1 ${color()}`}
            classList={{ "animate-pulse": isConnecting() }}
            aria-hidden
          />
        )}
      </Show>
      <div class="min-w-0 flex-1 px-4 py-3">
        <div class="flex flex-wrap items-start justify-between gap-1.5 mb-1">
          <span class="font-semibold text-sm text-text-primary break-all">
            {destinationLabel(props.destinationState().destination)}
          </span>
          <Show when={route() && hopCount() !== 1}>
            <Tag>
              <HopsIcon count={hopCount()} hideCount />
              <span class="ml-1">{route()}</span>
            </Tag>
          </Show>
        </div>

        <Show when={hasHealthContent(routeHealth())}>
          <div class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-1 text-text-secondary">
            <Stat
              label="Latency"
              value={latency()}
              tooltip={
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
              }
            />
            <Stat
              label="Checked"
              value={lastChecked()}
              tooltip={<span>Time since last health check</span>}
            />
            <Show when={settings.showDetailedMetrics}>
              <Stat
                label="Capacity"
                value={slots()}
                tooltip={<span>Available / total connection slots</span>}
              />
              <Stat
                label="Load"
                value={loadAvg()}
                tooltip={<span>Server load average. Lower is better.</span>}
              />
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
