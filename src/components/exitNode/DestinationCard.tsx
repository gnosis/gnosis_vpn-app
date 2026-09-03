import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { destinationLabel, holdsTitleChange } from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import SwitchSpinner from "./SwitchSpinner.tsx";
import ExitNodeListButton from "./ExitNodeListButton.tsx";

// How long each leg of the title cross-fade takes — text swaps at the
// midpoint, once the outgoing text has fully faded out.
const TITLE_FADE_MS = 300;

// Outlasts the 2.3s status poll (src-tauri/src/commands.rs) whose lateness is what makes a held title ambiguous.
const TITLE_SETTLE_MS = 3_000;

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

  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const clearSettleTimer = () => {
    clearTimeout(settleTimer);
    settleTimer = undefined;
  };
  onCleanup(clearSettleTimer);

  const showTitle = (title: string) => {
    if (!props.fadeTitle) {
      setDisplayTitle(title);
      return;
    }
    setFaded(true);
    setTimeout(() => {
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
      // change. Landing back on the painted title is also a held change cancelling itself.
      if (title === displayTitle()) {
        clearSettleTimer();
        return;
      }
      clearSettleTimer();
      if (holdsTitleChange(title, props.fadeTitle)) {
        settleTimer = setTimeout(() => showTitle(title), TITLE_SETTLE_MS);
        return;
      }
      showTitle(title);
    }),
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
