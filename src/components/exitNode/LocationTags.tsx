import { Match, Show, Switch } from "solid-js";
import { type CardPhase, cardTitle } from "@src/utils/destinations.ts";
import SwitchSpinner from "./SwitchSpinner.tsx";

const PILL = "rounded-full px-1.75 py-0.5 text-[10px] leading-[1.3] font-bold";

/** The exit's standing: a pill for auto's best or the user's pick, a caption once live. Fades in on each change. */
export function PhaseTag(props: { phase: CardPhase }) {
  return (
    <Show when={props.phase} keyed>
      {(current) => (
        <span class="flex whitespace-nowrap transition-opacity duration-300 starting:opacity-0">
          <Switch>
            <Match when={current === "auto"}>
              <span class={`${PILL} bg-pill-auto text-ok-ink`}>
                {cardTitle(current)}
              </span>
            </Match>
            <Match when={current === "selected"}>
              <span class={`${PILL} bg-pill-selected text-text-link`}>
                {cardTitle(current)}
              </span>
            </Match>
            <Match when={current === "connecting"}>
              <span class="text-xs text-text-subtle">
                {cardTitle(current)}
              </span>
            </Match>
          </Switch>
        </span>
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
