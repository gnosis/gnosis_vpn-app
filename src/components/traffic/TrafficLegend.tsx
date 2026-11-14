import { createUniqueId, Show } from "solid-js";
import Tooltip from "@src/components/common/Tooltip.tsx";

const RELAYS_TIP =
  "HOPR nodes this computer exchanges traffic with directly. Some of them carry your tunnel.";
const TUNNEL_TIP =
  "Your VPN tunnel runs through HOPR relays. This computer only sees its own connections, so the globe can't show which relay passes it on to the exit.";
const VIA_VPN_TIP =
  "Sites and services reached through the tunnel. To them, your traffic comes from the exit.";
const NOT_VIA_VPN_TIP =
  "Traffic sent outside the tunnel on purpose, such as Gnosis VPN's blockchain lookups and your local network. While disconnected, all your traffic shows here.";

/** The globe's stroke for this kind: colour plus weight and dashes, so identity never rests on colour alone. */
function Swatch(props: { class: string; width: number; dash?: string }) {
  return (
    <svg
      class={`shrink-0 ${props.class}`}
      width="16"
      height="4"
      viewBox="0 0 16 4"
      aria-hidden="true"
    >
      <line
        x1="1.5"
        y1="2"
        x2="14.5"
        y2="2"
        stroke="currentColor"
        stroke-width={props.width}
        stroke-dasharray={props.dash}
        stroke-linecap={props.dash ? "butt" : "round"}
      />
    </svg>
  );
}

function LegendItem(
  props: { label: string; tip: string; swatch: Parameters<typeof Swatch>[0] },
) {
  const descriptionId = createUniqueId();
  return (
    <Tooltip content={<span>{props.tip}</span>} triggerClass="w-fit shrink-0">
      <span
        class="inline-flex cursor-help items-center gap-1.5"
        tabIndex={0}
        aria-describedby={descriptionId}
      >
        <Swatch {...props.swatch} />
        <span class="underline decoration-text-muted decoration-dotted underline-offset-2">
          {props.label}
        </span>
      </span>
      {/* Always in the DOM so the description resolves on focus; the portalled bubble mounts too late for that. */}
      <span id={descriptionId} class="sr-only">{props.tip}</span>
    </Tooltip>
  );
}

/** Explains each line on the globe; the tunnel only exists while connected. */
export default function TrafficLegend(
  props: { relayCount: number; connected: boolean },
) {
  return (
    <>
      <LegendItem
        label={`${props.relayCount} HOPR ${
          props.relayCount === 1 ? "relay" : "relays"
        }`}
        tip={RELAYS_TIP}
        swatch={{ class: "text-traffic-gt", width: 2.5 }}
      />
      <Show when={props.connected}>
        <LegendItem
          label="Tunnel to exit"
          tip={TUNNEL_TIP}
          swatch={{ class: "text-traffic-sync-hi", width: 1.5, dash: "3 2" }}
        />
      </Show>
      <LegendItem
        label="Via VPN"
        tip={VIA_VPN_TIP}
        swatch={{ class: "text-text-secondary", width: 1.5 }}
      />
      <LegendItem
        label="Not via VPN"
        tip={NOT_VIA_VPN_TIP}
        swatch={{ class: "text-traffic-warn", width: 1.5, dash: "2.5 2" }}
      />
    </>
  );
}
