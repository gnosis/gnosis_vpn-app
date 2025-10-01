import { createMemo } from "solid-js";
import {
  isConnected,
  isConnecting,
  isDisconnecting,
  isServiceUnavailable,
} from "@src/utils/status";
import { useAppStore } from "@src/stores/appStore";

export function StatusIndicator() {
  const [appState] = useAppStore();

  const status = createMemo(() => {
    if (isConnected(appState.connectionStatus)) {
      return { text: "Connected", color: "bg-vpn-light-green" };
    }
    if (isConnecting(appState.connectionStatus)) {
      return { text: "Connecting", color: "bg-vpn-yellow" };
    }
    if (isDisconnecting(appState.connectionStatus)) {
      return { text: "Disconnecting", color: "bg-vpn-yellow" };
    }
    if (isServiceUnavailable(appState.connectionStatus)) {
      return {
        text: appState.isLoading ? "Loading..." : "Service unavailable",
        color: "bg-vpn-red",
      };
    }
    return {
      text: appState.isLoading ? "Loading..." : "Disconnected",
      color: "bg-vpn-red",
    };
  });

  return (
    <div class="flex flex-row gap-2 items-center justify-between rounded-full bg-white px-4 py-2 h-10">
      <div class={`w-3 h-3 rounded-2xl ${status().color}`} />
      <p class="text-sm font-bold">{status().text}</p>
    </div>
  );
}

export default StatusIndicator;
