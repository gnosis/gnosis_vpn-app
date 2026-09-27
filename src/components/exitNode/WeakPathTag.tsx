import CardTooltip from "./CardTooltip.tsx";
import Tag from "../common/Tag.tsx";

export const WEAK_PATH =
  "The best path found has degraded links. Connecting is your call; auto never picks it.";

/** Tinted orange, unlike the solid ConfigPill: this is the network's verdict, not configuration's hand. */
export default function WeakPathTag() {
  return (
    <CardTooltip tooltip={WEAK_PATH}>
      <Tag class="bg-vpn-orange/15 text-text-orange">Weak path</Tag>
    </CardTooltip>
  );
}
