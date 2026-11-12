import { Show } from "solid-js";
import {
  connectionPix,
  type DestinationState,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { formatCreditCompact } from "@src/utils/credit.ts";
import {
  exitShortId,
  isConfigOnly,
  routeGradeLabel,
} from "@src/utils/destinations.ts";
import { getLatencyMs } from "@src/utils/exitHealth.ts";
import Flag from "../Flag.tsx";
import ChevronIcon from "../icons/ChevronIcon.tsx";
import ConfigPill, { CONFIG_ONLY_DESTINATION } from "./ConfigPill.tsx";
import ConnectStage from "./ConnectStage.tsx";
import ExitCost from "./ExitCost.tsx";
import ExitDiagnostics from "./ExitDiagnostics.tsx";
import { createLocationState } from "./locationState.ts";
import { PhaseTag, SwitchingTo } from "./LocationTags.tsx";
import { ShortId } from "./LocationRow.tsx";
import SignalBars from "./SignalBars.tsx";
import UsageMeter from "./UsageMeter.tsx";

/** The advanced view's exit: what Connect targets, its live stats, and, open, its connect stage or diagnostics. */
export default function LocationCard(props: {
  destinationState: DestinationState;
}) {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();
  const {
    destination,
    id,
    name,
    exit,
    grade,
    verdict,
    phase,
    pending,
    candidateName,
    liveHere,
    reconnecting,
    attemptInFlight,
    connectPhase,
    connectSince,
    relaysFound,
    waitingCaption,
    stallText,
    costTarget,
  } = createLocationState(() => props.destinationState);

  const showDiagnostics = () =>
    !attemptInFlight() && settings.showDetailedMetrics;

  const tunnelRtt = () => {
    const c = appState.connection;
    return c.type === "connected" && c.destination === id()
      ? c.tunnel_ping_rtt
      : null;
  };
  const latencyMs = () =>
    reconnecting() ? null : getLatencyMs(exit(), tunnelRtt());

  // The live tunnel shows its usage; any other exit what connecting would set aside.
  const livePix = () => liveHere() ? connectionPix(appState.connection) : null;
  const setAside = () => {
    const chunk = appState.pixChunkBytes;
    return chunk === null ? "—" : formatCreditCompact(BigInt(chunk));
  };

  const openList = () => appActions.destinationListOpened();
  const toggleDetails = () =>
    void settingsActions.setShowDetailedMetrics(!settings.showDetailedMetrics);

  // The exit slides in only on a switch, not when the screen first shows it.
  let shownOnce = false;

  return (
    // Scrolls only once the diagnostics list is down to its minimum
    <div class="flex min-h-0 flex-col overflow-x-hidden overflow-y-auto rounded-[10px] bg-bg-location-card">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Choose location, now ${name()} #${
          exitShortId(destination().address)
        }`}
        class="flex cursor-pointer flex-col gap-2.25 px-3 pt-2.75 pb-2.5 hover:bg-row-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-control-tint"
        onClick={openList}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.repeat) openList();
          if (e.key === " ") e.preventDefault();
        }}
        onKeyUp={(e) => {
          if (e.key === " ") openList();
        }}
      >
        {/* Fixed height: the pill, the caption and "Switching to …" swap without moving the exit */}
        <div class="flex h-5 items-center justify-between gap-2">
          {/* A pending switch is auto's doing, so no "Selected Location" beside it */}
          <Show when={!pending()}>
            <PhaseTag phase={phase()} />
          </Show>
          <Show when={stallText()}>
            {(text) => (
              <span class="truncate text-xs text-warn-ink">{text()}</span>
            )}
          </Show>
          <SwitchingTo
            endsAt={pending()?.countdownEndsAt}
            name={candidateName()}
          />
        </div>
        <div class="flex w-full min-w-0 items-center">
          <Show when={id()} keyed>
            {(_id: string) => {
              const swapped = shownOnce;
              shownOnce = true;
              return (
                <span
                  class="flex w-full min-w-0 items-center gap-3"
                  classList={{ "animate-swap-in": swapped }}
                >
                  <Flag
                    code={destination().geo?.country ?? ""}
                    sizeClass="w-8.5 h-6 rounded"
                  />
                  <span class="flex min-w-0 flex-1 items-center gap-2.5">
                    <span class="flex min-w-0 items-center gap-1.5">
                      <span class="line-clamp-2 min-w-0 text-[15px] leading-tight font-bold text-balance">
                        {name()}
                        <ShortId id={exitShortId(destination().address)} />
                      </span>
                      <Show when={isConfigOnly(destination())}>
                        <ConfigPill
                          tooltip={CONFIG_ONLY_DESTINATION}
                          class="size-2.5"
                        />
                      </Show>
                    </span>
                    <span class="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-text-subtle">
                      <SignalBars grade={grade()} bare />
                      {verdict() ?? routeGradeLabel(grade())}
                    </span>
                  </span>
                </span>
              );
            }}
          </Show>
        </div>
      </div>
      {/* A connect waiting on this exit, or a switch away from its tunnel, shows the cost in place of the stats */}
      <div class="flex min-h-0 flex-col border-t border-dashed border-line-dash">
        <Show
          when={costTarget()}
          fallback={
            <>
              {/* Fixed height: "Sets aside" turns into the usage meter on connect without resizing the card */}
              <button
                type="button"
                class="flex h-13 w-full cursor-pointer items-center gap-4.5 px-3 text-left hover:bg-row-hover"
                aria-expanded={settings.showDetailedMetrics}
                aria-label={settings.showDetailedMetrics
                  ? "Hide details"
                  : "Show details"}
                onClick={toggleDetails}
              >
                <Show
                  when={livePix()}
                  fallback={
                    <span class="flex flex-col gap-0.5">
                      <span class="text-xs text-text-subtle">Sets aside</span>
                      <span class="font-figures text-[13px] leading-4 font-medium text-text-primary">
                        {setAside()}
                      </span>
                    </span>
                  }
                >
                  <UsageMeter class="min-w-0 flex-1" />
                </Show>
                <ChevronIcon
                  class={`ml-auto h-3 w-5.5 shrink-0 text-control-tint transition-transform duration-200 ${
                    settings.showDetailedMetrics ? "rotate-180" : ""
                  }`}
                />
              </button>
              <Show when={attemptInFlight() || showDiagnostics()}>
                <div class="flex min-h-0 flex-col border-t border-dashed border-line-dash transition-opacity duration-200 starting:opacity-0">
                  <Show
                    when={attemptInFlight()}
                    fallback={
                      <ExitDiagnostics
                        destinationState={props.destinationState}
                        latencyMs={latencyMs()}
                      />
                    }
                  >
                    <ConnectStage
                      phase={connectPhase()}
                      seed={connectSince()}
                      exitName={name()}
                      relays={relaysFound()}
                      caption={waitingCaption()}
                    />
                  </Show>
                </div>
              </Show>
            </>
          }
        >
          {(target) => (
            <ExitCost
              destination={target().destination}
              switching={target().switching}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
