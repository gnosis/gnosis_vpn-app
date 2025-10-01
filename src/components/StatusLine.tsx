import { type JSX, Show } from "solid-js";
import { isConnected, isConnecting, isDisconnecting } from "@src/utils/status";
import { useAppStore } from "@src/stores/appStore";

export default function StatusLine(props: { heightPx: number }): JSX.Element | null {
  const [appState] = useAppStore();
  const status = () => appState.connectionStatus;

  return (
    <>
      <Show when={isConnecting(status())}>
        <div
          class={`vpn-connector-line -bottom-6 connecting`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show when={isConnected(status())}>
        <div
          class={`vpn-connector-line -bottom-6 connected`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show when={isDisconnecting(status())}>
        <div
          class={`vpn-connector-line -bottom-6 disconnecting`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
    </>
  );
}
