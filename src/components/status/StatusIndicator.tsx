import { Show } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import { isSwitchingDestination } from "../../utils/status.ts";

const blinking = "bg-status-warn motion-safe:animate-status-blink";

export function StatusIndicator(
  { whenOfflineOnly = false }: { whenOfflineOnly?: boolean },
) {
  const [appState] = useAppStore();
  const isOffline = () =>
    appState.vpnStatus === "ServiceUnavailable" ||
    appState.vpnStatus === "WorkerRestarting";

  const status = () => {
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

  return (
    <Show when={!whenOfflineOnly || isOffline()}>
      <div class="flex flex-row gap-2 items-center h-7.5 text-xs text-text-subtle">
        {/* -translate-y-px: Unica77 at 12px puts the cap-height centre 1px above the line-box centre */}
        <div
          class={`w-2.25 h-2.25 shrink-0 rounded-full -translate-y-px ${status().dot}`}
        />
        <p>{status().text}</p>
      </div>
    </Show>
  );
}

export default StatusIndicator;
