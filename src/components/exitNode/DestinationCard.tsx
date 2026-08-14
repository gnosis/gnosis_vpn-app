import { createEffect, createSignal, on, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import SwitchSpinner from "./SwitchSpinner.tsx";
import ExitNodeListButton from "./ExitNodeListButton.tsx";

// How long each leg of the title cross-fade takes — text swaps at the
// midpoint, once the outgoing text has fully faded out.
const TITLE_FADE_MS = 300;

// Card height comes from content + padding, not a fixed constant — the
// title row's height stays the same whether the switching spinner is
// mounted or not (text-xs's line-height comfortably exceeds the spinner's
// 12px), so MainScreen's connector-bar math (driven by this row's live
// getBoundingClientRect()) never sees it jump.
export default function DestinationCard(props: {
  destinationState: DestinationState;
  title: string;
  // The countdown deadline (not just a boolean) so a mid-countdown reset —
  // the pending candidate changing before it commits — remounts the spinner
  // instead of leaving it stuck on its original, now-stale clock.
  switchEndsAt?: number | null;
  onOpenList: () => void;
}) {
  const destination = () => props.destinationState.destination;

  // Cross-fades on any title change rather than swapping the text instantly —
  // covers both a deliberate reveal-hold elsewhere (LocationBanner delaying
  // "Selected Location" -> "Best Location") and every other title change
  // (e.g. disconnect flipping connecting -> selected), with no special-casing
  // needed for why the text changed.
  const [displayTitle, setDisplayTitle] = createSignal(props.title);
  const [faded, setFaded] = createSignal(false);

  createEffect(
    on(
      () => props.title,
      (title) => {
        setFaded(true);
        setTimeout(() => {
          setDisplayTitle(title);
          setFaded(false);
        }, TITLE_FADE_MS);
      },
      { defer: true },
    ),
  );

  return (
    <div class="flex w-full shrink-0 items-center justify-between gap-2 rounded-2xl bg-slate-700 px-3 py-3.5">
      <div class="flex flex-col gap-4 min-w-0">
        <div class="flex items-center gap-1.5">
          <span
            class="text-xs text-text-secondary transition-opacity ease-out"
            style={{ "transition-duration": `${TITLE_FADE_MS}ms` }}
            classList={{ "opacity-0": faded() }}
          >
            {displayTitle()}
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
