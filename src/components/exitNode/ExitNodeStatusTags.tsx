import { Show } from "solid-js";
import {
  type DestinationState,
  formatHealth,
  isReadyToConnect,
} from "@src/services/vpnService.ts";
import { getConnectionLabel } from "@src/utils/status.ts";
import {
  formatExitHealthStatus,
  getExitHealthColor,
  type HealthColor,
  isExitHealthPendingOrUnreachable,
} from "@src/utils/exitHealth.ts";

const statusColorClass: Record<HealthColor, string> = {
  green: "text-vpn-light-green",
  yellow: "text-vpn-yellow",
  red: "text-vpn-red",
  gray: "text-text-muted",
};

function Tag(props: { value?: string | null; class?: string }) {
  return (
    <Show when={props.value}>
      <span
        class={`font-bold inline-flex items-center rounded-full px-2 py-0.5 ${
          props.class ?? "bg-bg-primary text-text-primary"
        }`}
      >
        {props.value}
      </span>
    </Show>
  );
}

export function ExitNodeStatusTags(props: {
  destinationState: DestinationState;
}) {
  const exitHealth = () => props.destinationState.exit_health;
  const connectivityHealth = () => props.destinationState.connectivity.health;

  const connectionLabel = () =>
    getConnectionLabel(props.destinationState.connection_state);
  const isConnected = () => connectionLabel() === "Connected";
  const isConnecting = () => connectionLabel() === "Connecting";

  const exitColor = () => getExitHealthColor(exitHealth());
  const exitStatusText = () => formatExitHealthStatus(exitHealth());

  /** Checking/Unreachable exit: show exit status; otherwise show connectivity label. */
  const showExitStatusOnly = () =>
    isExitHealthPendingOrUnreachable(exitHealth()) && !isConnected() &&
    !isConnecting();

  const healthColorClass = () => {
    if (isConnected()) return "text-vpn-light-green";
    return exitColor() === "red"
      ? "text-vpn-red"
      : exitColor() === "green"
      ? "text-vpn-light-green"
      : undefined;
  };

  const mutedClass = () => healthColorClass() ?? "text-text-primary";
  const healthLabel = () => {
    if (isConnected()) return "Connected";
    const h = connectivityHealth();
    if (isReadyToConnect(h)) return undefined;
    return formatHealth(h) as string;
  };

  const hasVisibleTag = () => {
    if (showExitStatusOnly()) return !!exitStatusText();
    if (isConnecting()) return true;
    return !!healthLabel();
  };

  return (
    <Show when={hasVisibleTag()}>
      <div class="flex flex-wrap items-center gap-1.5 mb-2">
        <Show when={showExitStatusOnly()}>
          <Tag
            value={exitStatusText()}
            class={`${statusColorClass[exitColor()]} bg-bg-primary`}
          />
        </Show>
        <Show when={!showExitStatusOnly()}>
          <Show when={healthLabel() && !isConnecting()}>
            <Tag
              value={healthLabel() ?? ""}
              class={`${mutedClass()} bg-bg-primary`}
            />
          </Show>
          <Show when={isConnecting()}>
            <Tag value="Connecting" class={`${mutedClass()} bg-bg-primary`} />
          </Show>
        </Show>
      </div>
    </Show>
  );
}
