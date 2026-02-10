import { createEffect, createSignal, type JSX, on, Show } from "solid-js";
import type {
  DestinationHealth,
  DestinationState,
  Health,
  RoutingOptions,
} from "@src/services/vpnService.ts";
import { formatHealth } from "@src/services/vpnService.ts";
import { getConnectionLabel } from "@src/utils/status.ts";
import {
  formatExitHealthStatus,
  formatLastChecked,
  formatLatency,
  formatLoadAvg,
  formatRouting,
  formatSlots,
  formatTotalTime,
  getExitHealthColor,
  getHopCount,
  type HealthColor,
} from "@src/utils/exitHealth.ts";
import HopsIcon from "./HopsIcon.tsx";

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

  const location = (): string | null => {
    const meta = props.destinationState.destination.meta ?? {};
    const parts = [meta.city, meta.state, meta.location].map((v) =>
      (v ?? "").trim()
    ).filter((v) => v.length > 0);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  const color = () => getExitHealthColor(exitHealth());
  const status = () => formatExitHealthStatus(exitHealth());
  const latency = () => formatLatency(exitHealth());
  const totalTime = () => formatTotalTime(exitHealth());
  const slots = () => formatSlots(exitHealth());
  const loadAvg = () => formatLoadAvg(exitHealth());
  const lastChecked = () => formatLastChecked(exitHealth());
  const route = () => formatRouting(routing());

  const isConnected = () =>
    getConnectionLabel(props.destinationState.connection_state) === "Connected";
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
  const [hidden, setHidden] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  createEffect(
    on(destId, (_id, prevId) => {
      if (prevId !== undefined && _id !== prevId) {
        if (timer !== undefined) clearTimeout(timer);
        setHidden(true);
        // Hold invisible for 50ms so the browser paints it, then fade in
        timer = setTimeout(() => setHidden(false), 50);
      }
    }),
  );

  const healthColorClass = () => {
    if (isConnected()) return "text-vpn-light-green";
    return color() === "red"
      ? "text-vpn-red"
      : color() === "green"
      ? "text-vpn-light-green"
      : undefined;
  };

  return (
    <Show when={hasContent()}>
      <div
        class={`w-full bg-bg-surface-alt rounded-2xl px-4 py-2.5 text-xs transition-all duration-300 ease-out ${
          hidden() ? "opacity-0 translate-y-3" : "opacity-100 translate-y-0"
        }`}
      >
        <div class="flex flex-wrap items-center gap-1.5 mb-1">
          <Tag value={location()} />
          <Show when={route()}>
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

        <div class="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-2 pl-2 text-text-secondary">
          <Stat label="Latency" value={latencyLabel()} />
          <Stat label="Capacity" value={slots()} />
          <Stat label="Load" value={loadAvg()} />
          <Stat label="Checked" value={lastChecked()} />
        </div>
      </div>
    </Show>
  );
}
