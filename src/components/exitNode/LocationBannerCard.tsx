import { Show } from "solid-js";
import type { DestinationModel } from "@src/stores/destinationMode.ts";
import type { DestinationState } from "@src/services/vpnService.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import SwitchSpinner from "./SwitchSpinner.tsx";
import ExitNodeListButton from "./ExitNodeListButton.tsx";

// "uninitialized" never actually reaches a rendered card — LocationBanner's
// entryIds() is empty until the mode resolves — but this stays exhaustive
// over the real union instead of a narrowed duplicate of it.
function cardTitle(phase: DestinationModel["phase"]): string {
  switch (phase) {
    case "auto":
      return "Best Location";
    case "selected":
      return "Selected Location";
    case "connecting":
      return "Current Location";
    case "uninitialized":
      return "";
  }
}

// Fixed height so the card row's geometry never shifts — MainScreen's
// connector-bar math anchors to this row and must not be affected by the
// switching spinner occupying the title row's slot.
export default function LocationBannerCard(props: {
  destinationState: DestinationState;
  destinationPhase: DestinationModel["phase"];
  // The countdown deadline (not just a boolean) so a mid-countdown reset —
  // the pending candidate changing before it commits — remounts the spinner
  // instead of leaving it stuck on its original, now-stale clock.
  switchEndsAt?: number | null;
  onOpenList: () => void;
}) {
  const destination = () => props.destinationState.destination;

  return (
    <div class="flex h-16 w-full shrink-0 flex-col justify-center gap-0.5 rounded-2xl bg-bg-surface px-4 snap-center">
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-text-secondary">
          {cardTitle(props.destinationPhase)}
        </span>
        <Show when={props.switchEndsAt} keyed>
          {(endsAt) => <SwitchSpinner endsAt={endsAt} />}
        </Show>
      </div>
      <div class="flex items-center justify-between gap-2 min-w-0">
        <span class="flex items-center gap-1.5 min-w-0 text-xs font-medium text-text-primary">
          <Flag code={destination().meta.flag ?? ""} />
          <span class="truncate">{destinationLabel(destination())}</span>
        </span>
        <ExitNodeListButton onClick={props.onOpenList} />
      </div>
    </div>
  );
}
