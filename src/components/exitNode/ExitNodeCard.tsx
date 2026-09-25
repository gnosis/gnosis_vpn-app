import { createMemo, Show } from "solid-js";
import type {
  DestinationState,
  RouteHealthView,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import {
  destinationDescription,
  getExitData,
  isConfigOnly,
  isConfigPinned,
  isReady,
  rankContext,
} from "@src/utils/destinations.ts";
import {
  formatLatency,
  formatLoadAvg,
  formatPathValue,
  formatRelays,
  formatRouting,
  formatSecondsAgo,
  getConnectionState,
  getHopCount,
  getLastCheckedEpoch,
  getLatencyLevel,
  getLatencyMs,
  hasHealthContent,
} from "@src/utils/exitHealth.ts";
import DestinationLabel from "./DestinationLabel.tsx";
import HopsIcon from "./HopsIcon.tsx";
import { levelValueClass } from "./levelColor.ts";
import SlotLoadStat from "./SlotLoadStat.tsx";
import Stat from "./Stat.tsx";
import Tag from "../common/Tag.tsx";
import Flag from "../Flag.tsx";
import ConfigPill, {
  CONFIG_ONLY_DESTINATION,
  OVERRIDDEN_VALUE,
} from "./ConfigPill.tsx";

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
  const exit = createMemo(() =>
    getExitData(props.destinationState(), appState.probe)
  );
  // The tunnel's own sample once we are connected through this exit.
  const tunnelRtt = () =>
    appState.connected?.destination_id === destId()
      ? appState.connected.tunnel_ping_rtt
      : null;
  const routing = (): number => props.destinationState().destination.routing;
  const description = () =>
    destinationDescription(props.destinationState().destination);
  const descriptionPinned = () =>
    isConfigPinned(props.destinationState().destination, "description");
  const configOnly = () => isConfigOnly(props.destinationState().destination);
  // Orange tint: every value of this destination is configuration's.
  const surfaceClass = () =>
    configOnly()
      ? "bg-vpn-orange/15 hover:bg-vpn-orange/25"
      : "bg-bg-surface-alt hover:bg-bg-surface";

  const connectionLabel = createMemo(() =>
    getConnectionState(
      destId(),
      appState.connected?.destination_id,
      appState.connecting?.destination_id,
      appState.reconnecting?.destination_id,
      appState.disconnecting,
    )
  );
  const isConnected = () => connectionLabel() === "Connected";
  const isConnecting = () => connectionLabel() === "Connecting";
  const isReconnecting = () => connectionLabel() === "Reconnecting";
  const isDisconnecting = () => connectionLabel() === "Disconnecting";
  const leftBarColor = () => {
    if (isConnected() || isConnecting() || isReconnecting()) {
      return "bg-vpn-light-green";
    }
    if (props.isSelected) return "bg-text-muted";
    return null;
  };

  const latency = () => formatLatency(exit(), tunnelRtt());
  // Graded on the same ramp as Load, so the two stats read alike.
  const latencyClass = () => {
    const ms = getLatencyMs(exit(), tunnelRtt());
    return ms === null ? undefined : levelValueClass(getLatencyLevel(ms));
  };

  const loadAvg = () => formatLoadAvg(exit());
  const pathValue = () => {
    const rh = routeHealth();
    return rh ? formatPathValue(rh) : null;
  };
  const relays = () => {
    const rh = routeHealth();
    return rh ? formatRelays(rh) : null;
  };

  const route = () => formatRouting(routing());
  const hopCount = () => getHopCount(routing());

  const lastChecked = (): string | null => {
    const rh = routeHealth();
    if (!rh) return null;
    const epoch = getLastCheckedEpoch(rh, exit());
    if (epoch === null) return null;
    const diff = Math.max(0, Math.round(props.nowSec() - epoch));
    return formatSecondsAgo(diff);
  };

  // A live or transitioning node stays clickable: its tunnel exists and the slot it fills is ours.
  const isClickable = () =>
    isReady(props.destinationState(), rankContext(appState)) ||
    isConnected() ||
    isConnecting() || isReconnecting() || isDisconnecting();

  return (
    <div
      class={`relative flex w-full text-xs transition-opacity ${surfaceClass()} ${
        !isClickable() ? "opacity-40 pointer-events-none" : "cursor-pointer"
      }`}
      onClick={() => {
        if (!isClickable()) return;
        props.onClick();
      }}
      onKeyDown={(e) => {
        if (!isClickable()) return;
        if (e.key === "Enter" && !e.repeat) props.onClick();
        if (e.key === " ") e.preventDefault(); // prevent scroll; activate on keyup
      }}
      onKeyUp={(e) => {
        if (!isClickable()) return;
        if (e.key === " ") props.onClick();
      }}
      role="button"
      tabIndex={isClickable() ? 0 : -1}
      aria-disabled={!isClickable()}
    >
      <Show when={leftBarColor()}>
        {(color) => (
          <div
            class={`absolute inset-y-0 left-0 w-1 ${color()}`}
            classList={{ "animate-pulse": isConnecting() || isReconnecting() }}
            aria-hidden="true"
          />
        )}
      </Show>
      <div class="min-w-0 flex-1 px-4 py-3">
        <div class="flex flex-wrap items-start justify-between gap-1.5 mb-1">
          <span class="flex items-center gap-1.5 font-semibold text-sm text-text-primary min-w-0">
            <Flag
              code={props.destinationState().destination.meta.flag ?? ""}
              pinned={isConfigPinned(
                props.destinationState().destination,
                "flag",
              )}
            />
            <DestinationLabel
              destination={props.destinationState().destination}
              class="break-all"
            />
            <Show when={configOnly()}>
              <ConfigPill tooltip={CONFIG_ONLY_DESTINATION} class="size-2.5" />
            </Show>
          </span>
          <Show when={route() && hopCount() !== 1}>
            <Tag>
              <HopsIcon count={hopCount()} hideCount />
              <span class="ml-1">{route()}</span>
            </Tag>
          </Show>
        </div>

        <Show when={description()}>
          {(text) => (
            <p class="mb-1 text-text-secondary">
              <Show when={descriptionPinned()} fallback={text()}>
                <ConfigPill tooltip={OVERRIDDEN_VALUE}>{text()}</ConfigPill>
              </Show>
            </p>
          )}
        </Show>

        <Show when={hasHealthContent(routeHealth())}>
          <div class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-1 text-text-secondary">
            <Stat
              label="Latency"
              value={latency()}
              valueClass={latencyClass()}
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
            <Stat
              label="Path"
              value={pathValue()}
              tooltip={
                <span>
                  Value of the best path found; 100% means nothing on it is
                  degraded.
                </span>
              }
            />
            <Stat
              label="Relays"
              value={relays()}
              tooltip={
                <span>
                  Distinct first relays over the paths found; more means fewer
                  single points of failure.
                </span>
              }
            />
            <Show when={settings.showDetailedMetrics}>
              <SlotLoadStat exit={exit()} />
              <Stat
                label="CPU Utilization"
                value={loadAvg()}
                tooltip={
                  <span>Load average of the server, the lower the better.</span>
                }
              />
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
