import { createEffect, createSignal, type JSX, Show } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";

export default function StatusLine(
  props: { heightPx: number },
): JSX.Element | null {
  const [appState] = useAppStore();
  const [wasDisconnecting, setWasDisconnecting] = createSignal(false);

  createEffect(() => {
    if (appState.vpnStatus === "Disconnecting") {
      setWasDisconnecting(true);
    } else if (appState.vpnStatus === "Disconnected" && wasDisconnecting()) {
      setTimeout(() => setWasDisconnecting(false), 1000);
    } else if (appState.vpnStatus !== "Disconnected") {
      setWasDisconnecting(false);
    }
  });

  return (
    <>
      <Show when={appState.vpnStatus === "Connecting"}>
        <div
          class={`vpn-connector-line bottom-6 connecting`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show when={appState.vpnStatus === "Connected"}>
        <div
          class={`vpn-connector-line bottom-6 connected`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show when={appState.vpnStatus === "Disconnecting"}>
        <div
          class={`vpn-connector-line bottom-6 disconnecting-static`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show when={appState.vpnStatus === "Disconnected" && wasDisconnecting()}>
        <div
          class={`vpn-connector-line bottom-6 disconnected-shrinking`}
          style={{ height: `${props.heightPx}px`, "pointer-events": "none" }}
        />
      </Show>
    </>
  );
}
