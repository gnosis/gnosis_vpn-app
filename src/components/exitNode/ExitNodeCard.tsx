import { createSignal, onCleanup, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { formatHealth, isReadyToConnect } from "@src/services/vpnService.ts";
import { getConnectionLabel } from "@src/utils/status.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import {
  formatExitHealthStatus,
  formatLatency,
  formatLoadAvg,
  formatRouting,
  formatSecondsAgo,
  formatSlots,
  formatTotalTime,
  getExitHealthColor,
  getHopCount,
  getLastCheckedEpoch,
  isExitHealthPendingOrUnreachable,
} from "@src/utils/exitHealth.ts";
import { ExitNodeStatusTags } from "./ExitNodeStatusTags.tsx";
import HopsIcon from "./HopsIcon.tsx";
import Stat from "./Stat.tsx";

export default function ExitNodeCard(props: {
  destinationState: DestinationState;
  isSelected: boolean;
  onClick: () => void;
}) {
  const exitHealth = () => props.destinationState.exit_health;
  const routing = () => props.destinationState.destination.routing;
  const connectivityHealth = () => props.destinationState.connectivity.health;

  const connectionLabel = () =>
    getConnectionLabel(props.destinationState.connection_state);
  const isConnected = () => connectionLabel() === "Connected";
  const isConnecting = () => connectionLabel() === "Connecting";

  const hasInteractiveStatus = () =>
    isConnected() || isReadyToConnect(connectivityHealth());

  /** Checking/Unreachable exit: show exit status; otherwise show connectivity healthLabel */
  const showExitStatusOnly = () =>
    isExitHealthPendingOrUnreachable(exitHealth()) && !isConnected() &&
    !isConnecting();

  const hasReachableExit = () => {
    if (isConnected()) return true;
    const eh = exitHealth();
    return typeof eh === "object" && "Success" in eh &&
      eh.Success.health.slots.available > 0;
  };

  const color = () => getExitHealthColor(exitHealth());
  const status = () => formatExitHealthStatus(exitHealth());
  const latency = () => {
    const tt = formatTotalTime(exitHealth());
    const rtt = formatLatency(exitHealth());
    if (rtt && tt) return `${rtt} (total: ${tt})`;
    return rtt;
  };
  const slots = () => formatSlots(exitHealth());
  const loadAvg = () => formatLoadAvg(exitHealth());
  const route = () => formatRouting(routing());
  const hops = () => getHopCount(routing());

  const [nowSec, setNowSec] = createSignal(Date.now() / 1000);
  const tick = setInterval(() => setNowSec(Date.now() / 1000), 1000);
  onCleanup(() => clearInterval(tick));

  const lastChecked = (): string | null => {
    const epoch = getLastCheckedEpoch(exitHealth());
    if (epoch === null) return null;
    const diff = Math.max(0, Math.round(nowSec() - epoch));
    return formatSecondsAgo(diff);
  };

  const healthColorClass = () => {
    if (isConnected()) return "text-vpn-light-green";
    return color() === "red"
      ? "text-vpn-red"
      : color() === "green"
      ? "text-vpn-light-green"
      : undefined;
  };

  const borderClass = () => {
    // if (isConnected()) return "ring-1 ring-vpn-light-green";
    // if (props.isSelected) return "ring-1 ring-text-secondary";
    return "";
  };

  const isClickable = () =>
    hasInteractiveStatus() && hasReachableExit() && !isConnecting();

  const healthLabel =
    () => (isConnected()
      ? "Connected"
      : (formatHealth(connectivityHealth()) as string));

  return (
    <div
      class={`w-full bg-bg-surface-alt px-4 py-3 text-xs transition-opacity ${borderClass()} ${
        !(hasInteractiveStatus() && hasReachableExit())
          ? "opacity-40 pointer-events-none"
          : isClickable()
          ? "cursor-pointer hover:bg-bg-surface"
          : "cursor-default"
      }`}
      onClick={isClickable() ? () => props.onClick() : undefined}
      role={isClickable() ? "button" : undefined}
    >
      <div class="flex justify-between items-start">
        <div class="min-w-0 w-full">
          <div class="flex w-full flex-wrap items-start justify-between gap-1.5 mb-1">
            {
              /* <span class="w-4 shrink-0 flex items-center justify-center">
              <ExitHealthBadge exitHealth={exitHealth()} compact connected={isConnected()} />
            </span> */
            }
            <span class="font-semibold text-sm text-text-primary break-all">
              {destinationLabel(props.destinationState.destination)}
            </span>
            <Show when={route() && hops() !== 1}>
              <span class="font-bold inline-flex items-center rounded-full px-2 py-0.5 bg-bg-primary text-text-primary">
                <HopsIcon count={hops()} hideCount />
                <span class="ml-1">{route()}</span>
              </span>
            </Show>
            <ExitNodeStatusTags
              showExitStatusOnly={showExitStatusOnly}
              exitStatusText={status}
              exitColor={color}
              healthLabel={healthLabel}
              healthColorClass={healthColorClass}
              isConnecting={isConnecting}
            />
          </div>

          {
            /* <div class="flex flex-wrap items-center gap-1.5 mb-2">
            <Tag value={status()} class={`${statusColorClass[color()]} bg-bg-primary`} />
            <Show when={isConnected()}>
              <Tag value="Connected" class="text-vpn-light-green bg-bg-primary" />
            </Show>
            <Show when={isConnecting()}>
              <Tag value="Connecting" class={`${healthColorClass() ?? "text-text-primary"} bg-bg-primary`} />
            </Show>
          </div> */
          }
        </div>
      </div>

      <div class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-1 text-text-secondary">
        <Stat label="Latency" value={latency()} />
        <Stat label="Capacity" value={slots()} />
        <Stat label="Load" value={loadAvg()} />
        <Stat label="Checked" value={lastChecked()} />
      </div>
    </div>
  );
}
