import CardTooltip from "./CardTooltip.tsx";
import Tag from "../common/Tag.tsx";

export const WEAK_ROUTE =
  "The best path found has degraded links. Connecting is your call; auto never picks it.";

/** Tinted orange, unlike the solid ConfigPill: this is the network's verdict, not configuration's hand. */
export default function WeakRouteTag() {
  return (
    <CardTooltip tooltip={WEAK_ROUTE}>
      <Tag class="bg-vpn-orange/15 text-text-orange">Weak route</Tag>
    </CardTooltip>
  );
}
