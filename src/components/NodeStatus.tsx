import {
  type DestinationState,
  formatHealth,
  type Health,
} from "../services/vpnService.ts";
import { getConnectionLabel } from "../utils/status.ts";

export default function NodeStatus(props: {
  connectionState?: DestinationState["connection_state"];
  health?: Health;
  warning?: boolean;
}) {
  const label = props.connectionState
    ? getConnectionLabel(props.connectionState)
    : "Unknown";

  let text: string | undefined;
  if (label === "Connecting" || label === "Disconnecting") {
    text = label;
  } else if (label === "Connected") {
    text = "Connected";
  } else {
    text = props.health ? formatHealth(props.health) : "";
  }

  return (
    <span
      class={`text-xs text-gray-500 font-light ${
        props.warning ? "text-red-500" : ""
      }`}
    >
      {text && text.length > 0 ? text : "\u00A0"}
    </span>
  );
}
