import type { TunnelStall } from "@src/services/vpnService.ts";
import CardTooltip from "./CardTooltip.tsx";
import Tag from "../common/Tag.tsx";

export const STALLED_TUNNEL =
  "The tunnel is up but pings through it are failing. The client reconnects once the counter reaches its limit.";

/** Orange like WeakRouteTag: the network's verdict, not configuration's. */
export default function StalledTag(props: { stall: TunnelStall }) {
  return (
    <CardTooltip tooltip={STALLED_TUNNEL}>
      <Tag class="bg-vpn-orange/15 text-text-orange">
        Stalled {props.stall.failed_pings}/{props.stall.reconnect_at}
      </Tag>
    </CardTooltip>
  );
}
