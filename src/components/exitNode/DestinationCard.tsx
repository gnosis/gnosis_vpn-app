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

// Card height comes from content + padding, not a fixed constant — the
// title row's height stays the same whether the switching spinner is
// mounted or not (text-xs's line-height comfortably exceeds the spinner's
// 12px), so MainScreen's connector-bar math (driven by this row's live
// getBoundingClientRect()) never sees it jump.
export default function DestinationCard(props: {
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
    <div class="flex w-full shrink-0 items-center justify-between gap-2 rounded-2xl bg-slate-700 px-3 py-3.5">
      <div class="flex flex-col gap-4 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-text-secondary">
            {cardTitle(props.destinationPhase)}
          </span>
          <Show when={props.switchEndsAt} keyed>
            {(endsAt) => <SwitchSpinner endsAt={endsAt} />}
          </Show>
        </div>
        <span class="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-primary">
          <Flag code={destination().meta.flag ?? ""} />
          <span class="truncate">{destinationLabel(destination())}</span>
        </span>
      </div>
      <ExitNodeListButton onClick={props.onOpenList} />
    </div>
  );
}
