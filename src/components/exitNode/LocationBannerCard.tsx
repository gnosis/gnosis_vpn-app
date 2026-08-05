import { Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import SwitchSpinner from "./SwitchSpinner.tsx";

// Fixed height so the card row's geometry never shifts — MainScreen's
// connector-bar math anchors to this row and must not be affected by the
// switching spinner occupying the same slot.
export default function LocationBannerCard(props: {
  destinationState: DestinationState;
  // The countdown deadline (not just a boolean) so a mid-countdown reset —
  // the pending candidate changing before it commits — remounts the spinner
  // instead of leaving it stuck on its original, now-stale clock.
  switchEndsAt?: number | null;
}) {
  const destination = () => props.destinationState.destination;

  return (
    <div class="flex h-16 w-full shrink-0 flex-col justify-center gap-0.5 rounded-2xl bg-bg-surface px-4 snap-center">
      <span class="text-xs text-text-secondary">Exit Node</span>
      <div class="flex items-center justify-between gap-2 min-w-0">
        <span class="flex items-center gap-1.5 min-w-0 text-sm font-medium text-text-primary">
          <Flag code={destination().meta.flag ?? ""} />
          <span class="truncate">{destinationLabel(destination())}</span>
        </span>
        <Show when={props.switchEndsAt} keyed>
          {(_endsAt) => <SwitchSpinner />}
        </Show>
      </div>
    </div>
  );
}
