import { createSignal, type JSX, onCleanup, Show } from "solid-js";
import type {
  DestinationState,
  RouteHealthView,
  RoutingOptions,
} from "@src/services/vpnService.ts";
import { VPNService } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import {
  formatExitHealthStatus,
  formatLatency,
  formatLoadAvg,
  formatRouting,
  formatSecondsAgo,
  formatSlots,
  getExitHealthColor,
  getHopCount,
  getLastCheckedEpoch,
  type HealthColor,
  isReadyToConnect,
} from "@src/utils/exitHealth.ts";
import HopsIcon from "./HopsIcon.tsx";
import Button from "../common/Button.tsx";
import Stat from "./Stat.tsx";

const statusColorClass: Record<HealthColor, string> = {
  green: "text-vpn-light-green",
  yellow: "text-vpn-yellow",
  red: "text-vpn-red",
  gray: "text-text-muted",
};

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
  const [appState, appActions] = useAppStore();

  const routeHealth = (): RouteHealthView | null =>
    props.destinationState.route_health ?? null;
  const routing = (): RoutingOptions =>
    props.destinationState.destination.routing;

  const destId = () => props.destinationState.destination.id;

  // Derive connection label from top-level app state instead of per-destination field
  const connectionLabel = () => {
    if (appState.connected === destId()) return "Connected";
    if (appState.connecting?.destination_id === destId()) return "Connecting";
    if (appState.disconnecting.some((d) => d.destination_id === destId())) {
      return "Disconnecting";
    }
    return "None";
  };
  const isConnected = () => connectionLabel() === "Connected";
  const isConnecting = () => connectionLabel() === "Connecting";

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

  const latencyLabel = () => latency();

  const hasContent = () => {
    const rh = routeHealth();
    if (!rh) return false;
    const state = rh.state;
    return state !== "NeedsFunding" &&
      state !== "Routable" &&
      !(typeof state === "object" && "NeedsPeering" in state) &&
      !(typeof state === "object" && "Unrecoverable" in state);
  };

  const canSwitch = () =>
    (appState.vpnStatus === "Connected" ||
      appState.vpnStatus === "Connecting") &&
    !isConnected() &&
    !isConnecting() &&
    isReadyToConnect(routeHealth() ?? undefined);

  const handleSwitch = async () => {
    const nodeId = props.destinationState.destination.id;
    appActions.chooseDestination(nodeId);
    try {
      await VPNService.connect(nodeId);
    } catch (error) {
      console.error("Failed to switch node:", error);
    }
  };

  return (
    <Show when={destId()} keyed>
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
              </div>
            </div>

            <Show when={canSwitch()}>
              <Button
                size="sm"
                variant="outline"
                fullWidth={false}
                class="bg-vpn-light-green text-white rounded-2xl h-10 w-16"
                onClick={() => void handleSwitch()}
              >
                Switch
              </Button>
            </Show>
          </div>

          <Show when={hasContent()}>
            <div class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-2 pl-2 text-text-secondary">
              <Stat
                label="Latency"
                value={latencyLabel()}
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
          </Show>
        </div>
      )}
    </Show>
  );
}
