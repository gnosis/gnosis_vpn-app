import { Show } from "solid-js";
import { type CardPhase, cardTitle } from "@src/utils/destinations.ts";
import SwitchSpinner from "./SwitchSpinner.tsx";

// Uneven padding: Unica77 sits glyphs 1px high in the line box.
const CHIP =
  "rounded-full px-1.75 pt-[3px] pb-px text-[10px] leading-[1.3] font-bold";

// Green is auto's, purple the user's pick; the live exit is neither, so it takes the controls' neutral.
const CHIP_COLORS: Partial<Record<CardPhase, string>> = {
  auto: "bg-pill-auto text-ok-ink",
  selected: "bg-pill-selected text-text-link",
  connecting: "bg-pill-current text-control-tint",
};

/** The exit's standing as a chip: auto's best, the user's pick, or the live exit. Fades in on each change. */
export function PhaseTag(props: { phase: CardPhase }) {
  return (
    <Show when={props.phase} keyed>
      {(current) => (
        <Show when={CHIP_COLORS[current]}>
          {(colors) => (
            <span class="flex whitespace-nowrap transition-opacity duration-300 starting:opacity-0">
              <span class={`${CHIP} ${colors()}`}>{cardTitle(current)}</span>
            </span>
          )}
        </Show>
      )}
    </Show>
  );
}

/** Auto's countdown to its candidate. Keyed: the spinner reads `endsAt` only when it mounts. */
export function SwitchingTo(
  props: { endsAt: number | undefined; name: string | null },
) {
  return (
    <Show when={props.endsAt} keyed>
      {(endsAt) => (
        <span class="flex min-w-0 items-center gap-1.5 text-xs text-text-subtle">
          <span class="size-4 shrink-0">
            <SwitchSpinner endsAt={endsAt} />
          </span>
          <span class="truncate">Switching to {props.name}</span>
        </span>
      )}
    </Show>
  );
}
