import type { DestinationState } from "@src/services/vpnService.ts";
import DestinationCard from "./DestinationCard.tsx";
import ExitHealthDetail from "./ExitHealthDetail.tsx";

// The card surrounding a destination card with the health stats and chevron
// toggle below it. One of these, not just the destination card inside it, is
// what the carousel in LocationBanner.tsx slides and peeks between — its own
// background/rounding is what should show at the edges, not just the
// destination card's.
export default function DetailCard(props: {
  destinationState: DestinationState;
  title: string;
  switchEndsAt?: number | null;
  onOpenList: () => void;
}) {
  return (
    <div class="w-full bg-slate-800 rounded-2xl p-1.5">
      <DestinationCard
        destinationState={props.destinationState}
        title={props.title}
        switchEndsAt={props.switchEndsAt}
        onOpenList={props.onOpenList}
      />
      <div class="w-full mt-1.5">
        <ExitHealthDetail destinationState={props.destinationState} />
      </div>
    </div>
  );
}
