import { Show } from "solid-js";
import type { HealthColor } from "@src/utils/exitHealth.ts";

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
  showExitStatusOnly: () => boolean;
  exitStatusText: () => string;
  exitColor: () => HealthColor;
  healthLabel: () => string | undefined | null;
  healthColorClass: () => string | undefined;
  isConnecting: () => boolean;
}) {
  const mutedClass = () => props.healthColorClass() ?? "text-text-primary";

  return (
    <div class="flex flex-wrap items-center gap-1.5 mb-2">
      <Show when={props.showExitStatusOnly()}>
        <Tag
          value={props.exitStatusText()}
          class={`${statusColorClass[props.exitColor()]} bg-bg-primary`}
        />
      </Show>
      <Show when={!props.showExitStatusOnly()}>
        <Show when={props.healthLabel() && !props.isConnecting()}>
          <Tag
            value={props.healthLabel() ?? ""}
            class={`${mutedClass()} bg-bg-primary`}
          />
        </Show>
        <Show when={props.isConnecting()}>
          <Tag value="Connecting" class={`${mutedClass()} bg-bg-primary`} />
        </Show>
      </Show>
    </div>
  );
}
