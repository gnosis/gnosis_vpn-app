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

  const connectorClass = () => {
    if (
      appState.vpnStatus === "Connecting" ||
      appState.vpnStatus === "Reconnecting"
    ) {
      return "vpn-connector-line connecting";
    }
    if (appState.vpnStatus === "Connected") {
      return "vpn-connector-line connected";
    }
    const isDisconnectingOrDisconnected =
      appState.vpnStatus === "Disconnecting" ||
      appState.vpnStatus === "Disconnected";
    if (isDisconnectingOrDisconnected && wasDisconnecting()) {
      return "vpn-connector-line disconnected-shrinking";
    }
    return null;
  };

  return (
    <Show when={connectorClass()}>
      {(cls) => (
        <div
          class={cls()}
          style={{
            height: `${props.heightPx}px`,
            bottom: `${props.bottomPx}px`,
            "pointer-events": "none",
          }}
        />
      )}
    </Show>
  );
}
