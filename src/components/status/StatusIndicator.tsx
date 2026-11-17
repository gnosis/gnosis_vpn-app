import { useAppStore } from "../../stores/appStore.ts";
import { isSwitchingDestination } from "../../utils/status.ts";

const blinking = "bg-status-warn motion-safe:animate-status-blink";

/** The VPN's connection state: the top bar's words and its dot's color. */
function useConnectionStatus(): () => { text: string; dot: string } {
  const [appState] = useAppStore();

  return () => {
    if (appState.vpnStatus === "Connected") {
      const isStalled = appState.connection.type === "connected" &&
        appState.connection.stall !== null;
      return isStalled
        ? { text: "Connected · stalled", dot: "bg-status-warn" }
        : { text: "Connected", dot: "bg-status-ok" };
    }
    if (appState.vpnStatus === "Connecting") {
      return { text: "Connecting", dot: blinking };
    }
    if (appState.vpnStatus === "Reconnecting") {
      return { text: "Reconnecting", dot: blinking };
    }
    if (
      isSwitchingDestination(appState.vpnStatus, appState.targetDestination)
    ) {
      return { text: "Connecting", dot: blinking };
    }
    if (appState.vpnStatus === "WorkerRestarting") {
      return { text: "Restarting...", dot: "bg-status-warn" };
    }
    if (appState.vpnStatus === "InUseByOtherUser") {
      return { text: "In use by another user", dot: "bg-status-warn" };
    }
    if (appState.vpnStatus === "ServiceUnavailable") {
      return {
        text: appState.isLoading ? "Loading..." : "Service unavailable",
        dot: "bg-status-bad",
      };
    } else {
      return {
        text: "Not connected",
        dot: "bg-status-idle",
      };
    }
  };
}

/** The connection state's dot alone; decorative, since the top bar says it in words. */
export function StatusDot(props: { class?: string }) {
  const status = useConnectionStatus();
  return (
    <span
      aria-hidden="true"
      class={`block size-2.25 shrink-0 rounded-full ${status().dot} ${
        props.class ?? ""
      }`}
    />
  );
}

export function StatusIndicator() {
  const status = useConnectionStatus();

  return (
    <div class="flex flex-row gap-2 items-center h-7.5 text-xs text-text-subtle">
      {/* -translate-y-px: Unica77 at 12px puts the cap-height centre 1px above the line-box centre */}
      <StatusDot class="-translate-y-px" />
      <p>{status().text}</p>
    </div>
  );
}

export default StatusIndicator;
