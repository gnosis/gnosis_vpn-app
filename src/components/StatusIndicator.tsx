import { useAppStore } from "@src/stores/appStore";

export function StatusIndicator() {
  const [appState] = useAppStore();

  console.log("vpn status", appState.vpnStatus);

  const status = () => {
    if (appState.vpnStatus === "Connected") {
      return { text: "Connected", color: "bg-vpn-light-green" };
    }
    if (appState.vpnStatus === "Connecting") {
      return { text: "Connecting", color: "bg-vpn-yellow" };
    }
    if (appState.vpnStatus === "Disconnecting") {
      return { text: "Disconnecting", color: "bg-vpn-yellow" };
    }
    if (appState.vpnStatus === "ServiceUnavailable") {
      return {
        text: appState.isLoading ? "Loading..." : "Service unavailable",
        color: "bg-vpn-red",
      };
    }
    return {
      text: appState.isLoading ? "Loading..." : "Disconnected",
      color: "bg-vpn-red",
    };
  };

  return (
    <div class="flex flex-row gap-2 items-center justify-between rounded-full bg-white px-4 py-2 h-10">
      <div class={`w-3 h-3 rounded-2xl ${status().color}`} />
      <p class="text-sm font-bold">{status().text}</p>
    </div>
  );
}

export default StatusIndicator;
