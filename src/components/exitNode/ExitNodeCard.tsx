import { createSignal, onCleanup, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { isReadyToConnect } from "@src/services/vpnService.ts";
import { getConnectionLabel } from "@src/utils/status.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import {
  formatLatency,
  formatLoadAvg,
  formatRouting,
  formatSecondsAgo,
  formatSlots,
  formatTotalTime,
  getHopCount,
  getLastCheckedEpoch,
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

  const hasReachableExit = () => {
    if (isConnected()) return true;
    const eh = exitHealth();
    return typeof eh === "object" && "Success" in eh &&
      eh.Success.health.slots.available > 0;
  };

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

  const isClickable = () =>
    hasInteractiveStatus() && hasReachableExit() && !isConnecting();

  return (
    <div
      class={`flex w-full bg-bg-surface-alt text-xs transition-opacity ${
        !(hasInteractiveStatus() && hasReachableExit())
          ? "opacity-40 pointer-events-none"
          : isClickable()
          ? "cursor-pointer hover:bg-bg-surface"
          : "cursor-default"
      }`}
      onClick={isClickable() ? () => props.onClick() : undefined}
      role={isClickable() ? "button" : undefined}
    >
      <Show when={isConnected()}>
        <div class="w-1 shrink-0 self-stretch bg-vpn-light-green" aria-hidden />
      </Show>
      <Show when={isConnecting()}>
        <div
          class="w-1 shrink-0 self-stretch bg-vpn-light-green animate-pulse"
          aria-hidden
        />
      </Show>
      <div class="min-w-0 flex-1 px-4 py-3">
        <div class="flex justify-between items-start">
          <div class="min-w-0 w-full">
            <div class="flex w-full flex-wrap items-start justify-between gap-1.5 mb-1">
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
                destinationState={props.destinationState}
              />
            </div>
          </div>
        </div>

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
          <Stat label="Capacity" value={slots()} />
          <Stat label="Load" value={loadAvg()} />
          <Stat label="Checked" value={lastChecked()} />
        </div>
      </div>
    </div>
  );
}
