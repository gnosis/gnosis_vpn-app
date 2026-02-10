import { createEffect, createSignal, on, Show } from "solid-js";
import type {
  DestinationHealth,
  DestinationState,
  Health,
  RoutingOptions,
} from "@src/services/vpnService.ts";
import { formatHealth } from "@src/services/vpnService.ts";
import {
  formatExitHealthStatus,
  formatLastChecked,
  formatLatency,
  formatLoadAvg,
  formatRouting,
  formatSlots,
  formatTotalTime,
  getExitHealthColor,
  type HealthColor,
} from "@src/utils/exitHealth.ts";

const statusColorClass: Record<HealthColor, string> = {
  green: "text-vpn-light-green",
  yellow: "text-vpn-yellow",
  red: "text-vpn-red",
  gray: "text-text-muted",
};

function DetailRow(
  props: { label: string; value: string | null; valueClass?: string },
) {
  return (
    <Show when={props.value}>
      <div class="grid grid-cols-[auto_1fr] items-baseline gap-x-4">
        <span class="text-text-muted">{props.label}</span>
        <span class={`text-right ${props.valueClass ?? "text-text-primary"}`}>
          {props.value}
        </span>
      </div>
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

  const healthLabel = () => formatHealth(connectivityHealth());

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

  return (
    <Show when={hasContent()}>
      <div
        class={`w-full dark:bg-bg-surface-alt rounded-2xl px-4 py-3 text-xs flex flex-col gap-1.5 transition-all duration-300 ease-out ${
          hidden() ? "opacity-0 translate-y-3" : "opacity-100 translate-y-0"
        }`}
      >
        <DetailRow label="Location" value={location()} />
        <DetailRow label="Route" value={route()} />
        <DetailRow
          label="Status"
          value={status()}
          valueClass={`font-medium ${statusColorClass[color()]}`}
        />
        <DetailRow label="Latency" value={latencyLabel()} />
        <DetailRow label="Capacity" value={slots()} />
        <DetailRow label="Load" value={loadAvg()} />
        <DetailRow
          label="Health"
          value={healthLabel()}
          valueClass={color() === "red"
            ? "text-vpn-red"
            : color() === "green"
            ? "text-vpn-light-green"
            : undefined}
        />
        <DetailRow label="Checked" value={lastChecked()} />
      </div>
    </Show>
  );
}
