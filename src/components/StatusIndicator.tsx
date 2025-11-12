import { useAppStore } from "@src/stores/appStore";

export function StatusIndicator({ size }: { size?: "sm" | "lg" }) {
  const [appState] = useAppStore();

  const containerClass = size === "sm" ? "" : "rounded-full bg-white px-4 h-10";
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
    } else {
      return {
        text: "Disconnected",
        color: "bg-gray-500",
      };
    }
  };

  return (
    <div
      class={`flex flex-row gap-2 items-center justify-between py-2 ${containerClass}`}
    >
      <div class={`w-3 h-3 rounded-2xl ${status().color}`} />
      <p class="text-sm font-bold">{status().text}</p>
    </div>
  );
}

export default StatusIndicator;
