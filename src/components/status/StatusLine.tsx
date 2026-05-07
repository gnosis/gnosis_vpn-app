import {
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";

export default function StatusLine(
  props: { heightPx: number; bottomPx: number },
): JSX.Element | null {
  const [appState] = useAppStore();
  const [wasDisconnecting, setWasDisconnecting] = createSignal(false);
  let disconnectTimeout: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    clearTimeout(disconnectTimeout);
  });

  createEffect(() => {
    if (appState.vpnStatus === "Disconnecting") {
      setWasDisconnecting(true);
    } else if (appState.vpnStatus === "Disconnected" && wasDisconnecting()) {
      clearTimeout(disconnectTimeout);
      disconnectTimeout = setTimeout(() => {
        setWasDisconnecting(false);
        disconnectTimeout = undefined;
      }, 1000);
    } else if (appState.vpnStatus !== "Disconnected") {
      clearTimeout(disconnectTimeout);
      disconnectTimeout = undefined;
      setWasDisconnecting(false);
    }
  });

  return (
    <>
      <Show when={appState.vpnStatus === "Connecting"}>
        <div
          class="vpn-connector-line connecting"
          style={{ height: `${props.heightPx}px`, bottom: `${props.bottomPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show when={appState.vpnStatus === "Connected"}>
        <div
          class="vpn-connector-line connected"
          style={{ height: `${props.heightPx}px`, bottom: `${props.bottomPx}px`, "pointer-events": "none" }}
        />
      </Show>
      <Show
        when={(appState.vpnStatus === "Disconnecting" ||
          appState.vpnStatus === "Disconnected") && wasDisconnecting()}
      >
        <div
          class="vpn-connector-line disconnected-shrinking"
          style={{ height: `${props.heightPx}px`, bottom: `${props.bottomPx}px`, "pointer-events": "none" }}
        />
      </Show>
    </>
  );
}
