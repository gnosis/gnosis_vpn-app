import { type JSX, Show } from "solid-js";
import { useAppStore } from "../stores/appStore.ts";

export default function StatusLine(
  props: { heightPx: number },
): JSX.Element | null {
  const [appState] = useAppStore();

  return (
    <>
      <Show when={appState.vpnStatus === "Connecting"}>
        <div
          class={`vpn-connector-line -bottom-6 connecting`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show when={appState.vpnStatus === "Connected"}>
        <div
          class={`vpn-connector-line -bottom-6 connected`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show when={appState.vpnStatus === "Disconnecting"}>
        <div
          class={`vpn-connector-line -bottom-6 disconnecting`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
    </>
  );
}
