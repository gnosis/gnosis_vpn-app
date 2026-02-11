import { Show } from "solid-js";
import type { DestinationHealth } from "@src/services/vpnService.ts";
import {
  formatLatency,
  formatSlots,
  getExitHealthColor,
  type HealthColor,
  isExitHealthRunning,
} from "@src/utils/exitHealth.ts";
import checkmarkIcon from "@assets/icons/checkmark.svg";

const dotColorClass: Record<HealthColor, string> = {
  green: "bg-vpn-light-green",
  yellow: "bg-vpn-yellow",
  red: "bg-vpn-red",
  gray: "bg-text-muted",
};

/**
 * Compact health indicator: colored dot + optional latency + optional slots.
 * When connected, displays a checkmark icon instead of the health dot.
 * Designed to sit inline inside dropdown option rows.
 */
export default function ExitHealthBadge(props: {
  exitHealth: DestinationHealth;
  /** When true, show only the dot/checkmark (for very compact contexts). */
  compact?: boolean;
  /** When true, hide the dot (show only latency/slots text). */
  hideDot?: boolean;
  /** When true, show a checkmark instead of the health dot. */
  connected?: boolean;
}) {
  const color = () => getExitHealthColor(props.exitHealth);
  const pulsing = () => isExitHealthRunning(props.exitHealth);
  const latency = () => formatLatency(props.exitHealth);
  const slots = () => formatSlots(props.exitHealth);

  return (
    <span class="inline-flex items-center gap-1.5 text-xs text-text-secondary leading-none">
      <Show when={!props.hideDot}>
        <Show
          when={!props.connected}
          fallback={
            <img
              src={checkmarkIcon}
              alt="Connected"
              width="14"
              height="14"
              class="shrink-0"
            />
          }
        >
          <span
            class={`inline-block w-2 h-2 rounded-full shrink-0 ${
              dotColorClass[color()]
            } ${pulsing() ? "animate-pulse" : ""}`}
          />
        </Show>
      </Show>
      <Show when={!props.compact && latency()}>
        <span class="tabular-nums">{latency()}</span>
      </Show>
      <Show when={!props.compact && slots()}>
        <span class="text-text-muted tabular-nums">{slots()}</span>
      </Show>
    </span>
  );
}
