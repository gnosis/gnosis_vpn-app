import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import SwitchSpinner from "./SwitchSpinner.tsx";
import ExitNodeListButton from "./ExitNodeListButton.tsx";

// How long each leg of the title cross-fade takes — text swaps at the
// midpoint, once the outgoing text has fully faded out.
const TITLE_FADE_MS = 300;

// The countdown ring sits beside the button, centred across both rows by the outer flex.
// Mounted only while counting down, so an idle card's label keeps its full width.
// At 36px it stays under the text column's 52px, so the card height MainScreen measures never moves.
export default function DestinationCard(props: {
  destinationState: DestinationState;
  title: string;
  // The countdown deadline (not just a boolean) so a mid-countdown reset —
  // the pending candidate changing before it commits — remounts the spinner
  // instead of leaving it stuck on its original, now-stale clock.
  switchEndsAt?: number | null;
  // Only the active card's title cross-fades (every phase/hold transition it
  // goes through, e.g. "Best Location" -> "Selected Location" once a better
  // candidate is found). Non-active cards just preview "Best"/"Selected" as
  // the pending candidate changes, and snap instead.
  fadeTitle: boolean;
  onOpenList: (originY: number) => void;
}) {
  const destination = () => props.destinationState.destination;

  const [displayTitle, setDisplayTitle] = createSignal(props.title);
  const [faded, setFaded] = createSignal(false);

  // Only one fade in flight — a superseded timer would flash its stale title mid-fade.
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(fadeTimer));

  const showTitle = (title: string) => {
    clearTimeout(fadeTimer);
    if (!props.fadeTitle) {
      setDisplayTitle(title);
      setFaded(false);
      return;
    }
    setFaded(true);
    fadeTimer = setTimeout(() => {
      setDisplayTitle(title);
      setFaded(false);
    }, TITLE_FADE_MS);
  };

  // Snaps (no fade) on the effect's first run rather than using `on`'s
  // `defer: true` — a newly-mounted card's title can already have moved on
  // from the value `createSignal(props.title)` captured at construction
  // (e.g. a fresh pending-candidate card mounts while `entries` and
  // `pending` land as two separate reactive writes of the same model
  // transition), and `defer` would silently discard that first real change
  // instead of just skipping its fade.
  let mounted = false;
  createEffect(
    on(() => props.title, (title) => {
      if (!mounted) {
        mounted = true;
        setDisplayTitle(title);
        return;
      }
      // `on` re-fires whenever anything upstream recomputes the title, even
      // when the recomputed text is unchanged (e.g. LocationBanner's
      // reveal-hold re-deriving the same "Selected Location" string) — skip
      // the fade rather than flashing the text out and back in for a no-op
      // change.
      if (title === displayTitle()) return;
      showTitle(title);
    }),
  );

  return (
    <div class="flex w-full shrink-0 items-center justify-between gap-2 rounded-2xl bg-slate-700 px-3 py-3.5">
      <div class="flex flex-1 flex-col gap-4 min-w-0">
        <span
          class="text-xs text-text-secondary transition-opacity ease-out"
          style={{ "transition-duration": `${TITLE_FADE_MS}ms` }}
          classList={{ "opacity-0": faded() }}
        >
          {displayTitle()}
        </span>
        <span class="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-text-primary">
          <Flag code={destination().meta.flag ?? ""} />
          <span class="truncate">{destinationLabel(destination())}</span>
        </span>
      </div>
      <Show when={props.switchEndsAt} keyed>
        {/* Sole definition of the ring's size — SwitchSpinner just fills this slot. */}
        {(endsAt) => (
          <span class="h-9 w-9 shrink-0">
            <SwitchSpinner endsAt={endsAt} />
          </span>
        )}
      </Show>
      <ExitNodeListButton onClick={props.onOpenList} />
    </div>
  );
}
