import { type Accessor, createMemo, createSignal, onCleanup } from "solid-js";
import {
  connectionDestination,
  type Destination,
  type DestinationState,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { cardPhase } from "@src/stores/destinationMode.ts";
import { exitCost } from "@src/stores/exitCost.ts";
import {
  exitDisplayName,
  getExitData,
  rankContext,
  routeGrade,
} from "@src/utils/destinations.ts";
import { formatExitHealthStatus } from "@src/utils/exitHealth.ts";
import {
  connectButtonLook,
  formatStall,
  waitingForRouteMessage,
} from "@src/utils/status.ts";

/** The main screen's exit as both views show it. Owns a 1 s clock: call it in a component body, not in a keyed block. */
export function createLocationState(state: Accessor<DestinationState>) {
  const [appState] = useAppStore();

  const destination = () => state().destination;
  const id = () => destination().id;
  const name = () => exitDisplayName(destination());
  const exit = createMemo(() => getExitData(state(), appState.probe));
  const grade = createMemo(() =>
    routeGrade(
      state(),
      rankContext(appState),
      appState.weakRoutes[id()]?.surfaced ?? false,
    )
  );
  // No bars to show: say why the exit is unusable instead.
  const verdict = () => {
    if (grade().kind !== "none") return null;
    const health = state().route_health;
    return health
      ? formatExitHealthStatus(
        health,
        exit(),
        appState.weakRoutes[id()]?.surfaced ?? false,
      )
      : "Unavailable";
  };

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

  const connectPhase = () => {
    const c = connection();
    return "phase" in c ? c.phase : null;
  };
  const connectSince = () => {
    const c = connection();
    return "since" in c ? c.since : 0;
  };
  const relaysFound = () => {
    const walk = state().route_health?.walk;
    return walk?.type === "paths" ? walk.distinct_first_relays : null;
  };
  // Reconnecting with no phase is a wait on route health; say why instead of a step.
  const waitingCaption = () =>
    appState.vpnStatus === "Reconnecting" && connectPhase() === null
      ? waitingForRouteMessage(appState, id())
      : null;

  // The stall's age has to tick between status updates.
  const [nowMs, setNowMs] = createSignal(Date.now());
  const tick = setInterval(() => setNowMs(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));
  const stallText = () => {
    const c = connection();
    return c.type === "connected" && c.destination === id() && c.stall
      ? formatStall(c.stall, nowMs())
      : null;
  };

  // a switch shows on whatever exit a tunnel being torn down or reconnecting has; MainScreen drops it once none does
  const costTarget = (): {
    destination: Destination;
    switching: boolean;
  } | null => {
    const request = exitCost();
    if (!request || !(request.switching || request.id === id())) return null;
    const target = appState.destinations[request.id];
    return target
      ? { destination: target.destination, switching: request.switching }
      : null;
  };

  return {
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
  };
}
