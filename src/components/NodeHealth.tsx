import { formatHealth, type Health } from "@src/services/vpnService";
import { Show } from "solid-js";

export default function NodeHealth(
  props: { health?: Health; connected?: boolean; hideWhenConnected?: boolean },
) {
  const shouldShow = props.health !== undefined &&
    !(props.hideWhenConnected && props.connected === true);
  return (
    <Show
      when={shouldShow}
      fallback={
        <span class="text-xs text-gray-500 font-light invisible">.</span>
      }
    >
      <span class="text-xs text-gray-500 font-light">
        {formatHealth(props.health as Health)}
      </span>
    </Show>
  );
}
