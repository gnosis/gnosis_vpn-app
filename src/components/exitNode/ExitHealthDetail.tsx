import { createSignal, type JSX, onCleanup, Show } from "solid-js";
import type {
  DestinationHealth,
  DestinationState,
  Health,
  RoutingOptions,
} from "@src/services/vpnService.ts";
import {
  formatHealth,
  isReadyToConnect,
  VPNService,
} from "@src/services/vpnService.ts";
import { getConnectionLabel } from "@src/utils/status.ts";
import { useAppStore } from "@src/stores/appStore.ts";
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
  type HealthColor,
} from "@src/utils/exitHealth.ts";
import HopsIcon from "./HopsIcon.tsx";
import Button from "../common/Button.tsx";

const statusColorClass: Record<HealthColor, string> = {
  green: "text-vpn-light-green",
  yellow: "text-vpn-yellow",
  red: "text-vpn-red",
  gray: "text-text-muted",
};

function Stat(
  props: { label: string; value: string | null; valueClass?: string },
) {
  return (
    <Show when={props.value}>
      <div class="flex flex-col">
        <span class="text-text-muted">{props.label}</span>
        <span class={props.valueClass ?? "text-text-primary"}>
          {props.value}
        </span>
      </div>
    </Show>
  );
}

function Tag(
  props: { value?: string | null; class?: string; children?: JSX.Element },
) {
  return (
    <Show when={props.value || props.children}>
      <span
        class={`font-bold inline-flex items-center rounded-full px-2 py-0.5 ${
          props.class ?? "bg-bg-primary text-text-primary"
        }`}
      >
        {props.children ?? props.value}
      </span>
    </Show>
  );
}

/**
 * Expanded health detail panel shown below the ExitNode card.
 * Displays latency, capacity, load, routing, and error info.
 */
export default function ExitHealthDetail(
  props: { destinationState: DestinationState },
) {
  const exitHealth = (): DestinationHealth =>
    props.destinationState.exit_health;
  const routing = (): RoutingOptions =>
    props.destinationState.destination.routing;
  const connectivityHealth = (): Health =>
    props.destinationState.connectivity.health;

  const color = () => getExitHealthColor(exitHealth());
  const status = () => formatExitHealthStatus(exitHealth());
  const latency = () => formatLatency(exitHealth());
  const totalTime = () => formatTotalTime(exitHealth());
  const slots = () => formatSlots(exitHealth());
  const loadAvg = () => formatLoadAvg(exitHealth());
  const route = () => formatRouting(routing());

  const [nowSec, setNowSec] = createSignal(Date.now() / 1000);
  const tick = setInterval(() => setNowSec(Date.now() / 1000), 1000);
  onCleanup(() => clearInterval(tick));

  const lastChecked = (): string | null => {
    const epoch = getLastCheckedEpoch(exitHealth());
    if (epoch === null) return null;
    const diff = Math.max(0, Math.round(nowSec() - epoch));
    return formatSecondsAgo(diff);
  };

  const [appState, appActions] = useAppStore();

  const connectionLabel = () =>
    getConnectionLabel(props.destinationState.connection_state);
  const isConnected = () => connectionLabel() === "Connected";
  const healthLabel =
    () => (isConnected() ? "Connected" : formatHealth(connectivityHealth()));

  const latencyLabel = () => {
    const tt = totalTime();
    const rtt = latency();
    if (rtt && tt) return `${rtt} (total: ${tt})`;
    return rtt;
  };

  const hasContent = () => {
    const eh = exitHealth();
    return eh !== "Init";
  };

  const destId = () => props.destinationState.destination.id;

  const isConnecting = () => connectionLabel() === "Connecting";

  const canSwitch = () =>
    (appState.vpnStatus === "Connected" ||
      appState.vpnStatus === "Connecting") &&
    !isConnected() &&
    !isConnecting() &&
    isReadyToConnect(connectivityHealth());

  const handleSwitch = async () => {
    const nodeId = props.destinationState.destination.id;
    appActions.chooseDestination(nodeId);
    try {
      await VPNService.connect(nodeId);
      appActions.startStatusPolling();
    } catch (error) {
      console.error("Failed to switch node:", error);
    }
  };

  const healthColorClass = () => {
    if (isConnected()) return "text-vpn-light-green";
    return color() === "red"
      ? "text-vpn-red"
      : color() === "green"
      ? "text-vpn-light-green"
      : undefined;
  };

  return (
    <Show when={hasContent() ? destId() : false} keyed>
      {(_id: string) => (
        <div class="w-full bg-bg-surface-alt rounded-2xl px-4 py-2.5 text-xs fade-in-up">
          <div class="flex justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-1.5 mb-1">
                <Tag
                  value={destinationLabel(props.destinationState.destination)}
                />
                <Show when={route() && getHopCount(routing()) !== 1}>
                  <Tag>
                    <HopsIcon count={getHopCount(routing())} hideCount />
                    <span class="ml-1">{route()}</span>
                  </Tag>
                </Show>
              </div>

              <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                <Tag
                  value={status()}
                  class={`${statusColorClass[color()]} bg-bg-primary`}
                />
                <Show when={healthLabel()}>
                  <Tag
                    value={healthLabel()}
                    class={`${
                      healthColorClass() ?? "text-text-primary"
                    } bg-bg-primary`}
                  />
                </Show>
              </div>
            </div>

            <Show when={canSwitch()}>
              <Button
                size="sm"
                variant="outline"
                fullWidth={false}
                class="bg-vpn-light-green text-white"
                onClick={() => void handleSwitch()}
              >
                Switch
              </Button>
            </Show>
          </div>

          <div class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-2 pl-2 text-text-secondary">
            <Stat label="Latency" value={latencyLabel()} />
            <Stat label="Capacity" value={slots()} />
            <Stat label="Load" value={loadAvg()} />
            <Stat label="Checked" value={lastChecked()} />
          </div>
        </div>
      )}
    </Show>
  );
}
