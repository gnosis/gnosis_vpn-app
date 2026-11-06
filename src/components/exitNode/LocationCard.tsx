import {
  createMemo,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import {
  connectionDestination,
  type DestinationState,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { cardPhase } from "@src/stores/destinationMode.ts";
import { exitCost } from "@src/stores/exitCost.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { MB_PER_EXIT } from "@src/utils/credit.ts";
import {
  cardTitle,
  exitDisplayName,
  exitShortId,
  getExitData,
  isConfigOnly,
  rankContext,
  routeGrade,
  routeGradeLabel,
} from "@src/utils/destinations.ts";
import { formatExitHealthStatus, getLatencyMs } from "@src/utils/exitHealth.ts";
import {
  connectButtonLook,
  formatStall,
  waitingForRouteMessage,
} from "@src/utils/status.ts";
import Flag from "../Flag.tsx";
import Tooltip from "../common/Tooltip.tsx";
import ChevronIcon from "../icons/ChevronIcon.tsx";
import ConfigPill, { CONFIG_ONLY_DESTINATION } from "./ConfigPill.tsx";
import ConnectStage from "./ConnectStage.tsx";
import ExitCost from "./ExitCost.tsx";
import ExitDiagnostics from "./ExitDiagnostics.tsx";
import { ShortId } from "./LocationRow.tsx";
import SignalBars from "./SignalBars.tsx";
import SwitchSpinner from "./SwitchSpinner.tsx";

const PILL = "rounded-full px-1.75 py-0.5 text-[10px] leading-[1.3] font-bold";

/** The main screen's exit: what Connect targets, its live stats, and, open, its connect stage or diagnostics. */
export default function LocationCard(props: {
  destinationState: DestinationState;
}) {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const destination = () => props.destinationState.destination;
  const id = () => destination().id;
  const name = () => exitDisplayName(destination());
  const exit = createMemo(() =>
    getExitData(props.destinationState, appState.probe)
  );
  const grade = createMemo(() =>
    routeGrade(
      props.destinationState,
      rankContext(appState),
      appState.weakRoutes[id()]?.surfaced ?? false,
    )
  );

  const phase = () => cardPhase(appState.mode);
  const pending = () =>
    appState.mode.mode.mode === "auto" ? appState.mode.mode.pending : null;
  const candidateName = () => {
    const candidate = pending() &&
      appState.destinations[pending()!.candidateId];
    return candidate ? exitDisplayName(candidate.destination) : null;
  };

  const connection = () => appState.connection;
  const liveHere = () => connectionDestination(connection()) === id();
  const reconnecting = () => liveHere() && connection().type === "reconnecting";
  // Same rule as the button: an attempt is in flight while it would offer Cancel.
  const attemptInFlight = () =>
    reconnecting() ||
    connectButtonLook(
        appState.vpnStatus,
        appState.targetDestination,
        connection().type === "reconnecting",
      ).label === "Cancel";
  const showDiagnostics = () =>
    !attemptInFlight() && settings.showDetailedMetrics;
  // No bars to show: say why the exit is unusable instead.
  const verdict = () => {
    if (grade().kind !== "none") return null;
    const health = props.destinationState.route_health;
    return health
      ? formatExitHealthStatus(
        health,
        exit(),
        appState.weakRoutes[id()]?.surfaced ?? false,
      )
      : "Unavailable";
  };

  const connectPhase = () => {
    const c = connection();
    return "phase" in c ? c.phase : null;
  };
  const connectSince = () => {
    const c = connection();
    return "since" in c ? c.since : 0;
  };
  const relaysFound = () => {
    const walk = props.destinationState.route_health?.walk;
    return walk?.type === "paths" ? walk.distinct_first_relays : null;
  };
  // Reconnecting with no phase is a wait on route health; say why instead of a step.
  const waitingCaption = () =>
    appState.vpnStatus === "Reconnecting" && connectPhase() === null
      ? waitingForRouteMessage(appState, id())
      : null;

  const stall = () => {
    const c = connection();
    return c.type === "connected" && c.destination === id() ? c.stall : null;
  };
  // The stall's age has to tick between status updates.
  const [nowMs, setNowMs] = createSignal(Date.now());
  const tick = setInterval(() => setNowMs(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));

  const tunnelRtt = () => {
    const c = connection();
    return c.type === "connected" && c.destination === id()
      ? c.tunnel_ping_rtt
      : null;
  };
  const latencyMs = () =>
    reconnecting() ? null : getLatencyMs(exit(), tunnelRtt());

  const openList = () => appActions.destinationListOpened();
  // a switch shows on whatever card a tunnel being torn down or reconnecting has; MainScreen drops it once none does
  const costShown = () => {
    const request = exitCost();
    return request && (request.switching || request.id === id())
      ? request
      : null;
  };
  const toggleDetails = () =>
    void settingsActions.setShowDetailedMetrics(!settings.showDetailedMetrics);

  // The exit slides in only on a switch, not when the screen first shows it.
  let shownOnce = false;

  return (
    <div class="overflow-hidden rounded-[10px] bg-bg-location-card">
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
          <Show when={!pending() && phase()} keyed>
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
          <Show when={stall()}>
            {(current) => (
              <span class="truncate text-xs text-warn-ink">
                {formatStall(current(), nowMs())}
              </span>
            )}
          </Show>
          <Show when={pending()?.countdownEndsAt} keyed>
            {(endsAt) => (
              <span class="flex min-w-0 items-center gap-1.5 text-xs text-text-subtle">
                <span class="size-4 shrink-0">
                  <SwitchSpinner endsAt={endsAt} />
                </span>
                <span class="truncate">Switching to {candidateName()}</span>
              </span>
            )}
          </Show>
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
      <Show
        when={costShown()}
        fallback={
          <>
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-4.5 border-t border-dashed border-line-dash px-3 py-2.25 text-left hover:bg-row-hover"
              aria-expanded={settings.showDetailedMetrics}
              aria-label={settings.showDetailedMetrics
                ? "Hide details"
                : "Show details"}
              onClick={toggleDetails}
            >
              {/* Hover only: a focus stop would sit inside the row's button */}
              <Tooltip content={<div class="font-bold">Feature coming</div>}>
                <span class="flex flex-col gap-0.5">
                  <span class="text-xs text-text-subtle">
                    {appState.vpnStatus === "Disconnected"
                      ? "Sets aside"
                      : "Data left"}
                  </span>
                  <span class="font-figures text-[13px] leading-4 font-medium text-text-primary">
                    {`${MB_PER_EXIT} MB`}
                    <span class="sr-only">, feature coming</span>
                  </span>
                </span>
              </Tooltip>
              <ChevronIcon
                class={`ml-auto h-3 w-5.5 text-control-tint transition-transform duration-200 ${
                  settings.showDetailedMetrics ? "rotate-180" : ""
                }`}
              />
            </button>
            <Show when={attemptInFlight() || showDiagnostics()}>
              <div class="border-t border-dashed border-line-dash transition-opacity duration-200 starting:opacity-0">
                <Show
                  when={attemptInFlight()}
                  fallback={
                    <ExitDiagnostics
                      destinationState={props.destinationState}
                      latencyMs={latencyMs()}
                      showUsage={liveHere()}
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
        {(request) => (
          <Show when={appState.destinations[request().id]}>
            {(target) => (
              <ExitCost
                destination={target().destination}
                switching={request().switching}
              />
            )}
          </Show>
        )}
      </Show>
    </div>
  );
}
