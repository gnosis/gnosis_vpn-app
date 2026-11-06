import { Match, Show, Switch } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import Flag from "../Flag.tsx";
import ConnectStage from "./ConnectStage.tsx";
import ExitCost from "./ExitCost.tsx";
import { createLocationState } from "./locationState.ts";
import { PhaseTag, SwitchingTo } from "./LocationTags.tsx";
import SignalBars from "./SignalBars.tsx";
import UsageMeter from "./UsageMeter.tsx";

/** The simple view's exit: its flag, name and standing, the connect stage, then its cost or usage at the foot. */
export default function LocationHero(props: {
  destinationState: DestinationState;
}) {
  const [settings] = useSettingsStore();
  const {
    destination,
    id,
    name,
    grade,
    verdict,
    phase,
    pending,
    candidateName,
    liveHere,
    attemptInFlight,
    connectPhase,
    connectSince,
    relaysFound,
    waitingCaption,
    stallText,
    costTarget,
  } = createLocationState(() => props.destinationState);

  // The exit slides in only on a switch, not when the screen first shows it.
  let shownOnce = false;

  return (
    // Clipped: the slide-in and the globe's exit label would scroll the screen sideways.
    <div class="flex min-h-0 flex-1 flex-col overflow-x-clip">
      {/* The one part that gives way when banners stack */}
      <div class="h-12.5" />
      <Show when={id()} keyed>
        {(_id: string) => {
          const swapped = shownOnce;
          shownOnce = true;
          return (
            <div
              class="flex flex-col items-center gap-3 text-center"
              classList={{ "motion-safe:animate-swap-in": swapped }}
            >
              <Show when={settings.flagDisplay !== "none"}>
                <span class="flex size-14 items-center justify-center rounded-2xl bg-pill-selected">
                  <Flag
                    code={destination().geo?.country ?? ""}
                    sizeClass="w-8.5 h-6 rounded"
                  />
                </span>
              </Show>
              <span class="flex max-w-full flex-col items-center gap-1">
                <span class="flex max-w-full items-center gap-2.5">
                  <span class="line-clamp-2 min-w-0 text-[22px] leading-7 font-bold text-balance">
                    {name()}
                  </span>
                  <SignalBars grade={grade()} />
                </span>
                <Show when={verdict()}>
                  {(text) => (
                    <span class="text-xs text-text-subtle">{text()}</span>
                  )}
                </Show>
              </span>
            </div>
          );
        }}
      </Show>
      {/* Kept when empty, so the globe stays put as the pill goes */}
      <div class="mt-2.5 flex h-5 shrink-0 items-center justify-center">
        <Switch>
          <Match when={pending()}>
            <SwitchingTo
              endsAt={pending()?.countdownEndsAt}
              name={candidateName()}
            />
          </Match>
          <Match when={stallText()}>
            {(text) => (
              <span class="truncate text-xs text-warn-ink">{text()}</span>
            )}
          </Match>
          {/* Live, no pick or best is left to name */}
          <Match when={phase() !== "connecting"}>
            <PhaseTag phase={phase()} />
          </Match>
        </Switch>
      </div>
      {/* A switch's cost takes the globe's place, as on the card */}
      <Show when={attemptInFlight() && !costTarget()}>
        <div class="mt-3 shrink-0 transition-opacity duration-200 starting:opacity-0">
          <ConnectStage
            size="hero"
            phase={connectPhase()}
            seed={connectSince()}
            exitName={name()}
            relays={relaysFound()}
            caption={waitingCaption()}
          />
        </div>
      </Show>
      <div class="mt-auto shrink-0 pt-2.5 empty:hidden">
        <Show
          when={costTarget()}
          fallback={
            <Show when={liveHere() && !attemptInFlight()}>
              <UsageMeter />
            </Show>
          }
        >
          {(target) => (
            // No overflow-hidden: it would let the column squash the buttons.
            <div class="rounded-[10px] bg-bg-location-card">
              <ExitCost
                destination={target().destination}
                switching={target().switching}
              />
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
