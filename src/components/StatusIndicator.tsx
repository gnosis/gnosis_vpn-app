import { createMemo } from "solid-js";
import { type Status } from "../services/vpnService.ts";
import {
  isConnected,
  isConnecting,
  isDisconnecting,
  isServiceUnavailable,
} from "../services/vpnService.ts";

export function StatusIndicator(props: {
  status: Status;
  isLoading?: boolean;
}) {
  const statusText = createMemo(() => {
    if (props.isLoading) return "Loading...";
    if (isConnected(props.status)) return "Connected";
    if (isConnecting(props.status)) return "Connecting...";
    if (isDisconnecting(props.status)) return "Disconnecting...";
    if (isServiceUnavailable(props.status)) return "Service unavailable";
    return "Disconnected";
  });

  return (
    <div class="flex flex-col items-center space-y-4">
      <h1 class="text-xl font-bold">Gnosis VPN</h1>
      <p class="font-medium">{statusText()}</p>
    </div>
  );
}

export default StatusIndicator;
