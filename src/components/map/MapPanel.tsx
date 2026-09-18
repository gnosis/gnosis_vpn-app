import { createEffect, createMemo, createSignal } from "solid-js";
import { useAppStore } from "@src/stores/appStore.ts";
import { destinationLocation } from "@src/utils/destinations.ts";
import { getHopCount } from "@src/utils/exitHealth.ts";
import { resolveExitLocation } from "@src/utils/exitLocation.ts";
import { resolveRegion } from "@src/utils/regions.ts";
import { buildRoutePair } from "@src/utils/route.ts";
import WorldMap from "./WorldMap.tsx";

/// Reads where the user and their exit are, and hands the pair to the map.
export default function MapPanel() {
  const [appState] = useAppStore();

  // The exit the tunnel is on or heading for. A destination merely selected in the carousel is
  // not shown: the map answers "where does my traffic come out", not "where might it".
  const liveDestination = createMemo(() => {
    const id = appState.connected?.destination_id ??
      appState.connecting?.destination_id ??
      appState.reconnecting?.destination_id;
    return id ? appState.destinations[id]?.destination : undefined;
  });

  const homeCode = () => appState.homeLocation?.country.toLowerCase();
  const homeRegion = createMemo(() => resolveRegion(homeCode()));
  const exitLocation = createMemo(() => {
    const destination = liveDestination();
    return destination ? resolveExitLocation(destination) : undefined;
  });

  const hopCount = () => {
    const destination = liveDestination();
    return destination ? getHopCount(destination.routing) : 0;
  };

  // Seeds the hop countries, and identifies the route for the draw-on animation.
  //
  // Minted once per connection attempt and held for its whole life. It cannot be derived
  // from the status: `connecting.since` and `connected.since` are different timestamps, so
  // anything time-based would move the hops halfway through connecting. Latching on the
  // transition into a connection instead gives fresh countries on every connect while
  // keeping them still for the duration of one.
  const [attempt, setAttempt] = createSignal(0);
  let lastId: string | undefined;
  createEffect(() => {
    const id = liveDestination()?.id;
    if (id === lastId) return;
    lastId = id;
    if (id) setAttempt((n) => n + 1);
  });

  const routeKey = createMemo(() => {
    const id = liveDestination()?.id;
    return id ? `${id}:${attempt()}` : undefined;
  });

  const isConnected = () => appState.connected !== null;

  const routes = createMemo(() => {
    const home = homeRegion()?.point;
    const exit = exitLocation()?.point;
    const key = routeKey();
    if (!home || !exit || !key) return undefined;
    return buildRoutePair(home, exit, hopCount(), key);
  });

  // The map is decorative to a screen reader, so the whole of what it conveys has to be here.
  // The hop count is real and worth stating; the waypoints' positions are not, so they are
  // deliberately left unnamed.
  const label = createMemo(() => {
    const home = homeRegion()?.name;
    const exit = liveDestination();
    if (!home && !exit) return "World map";
    if (!exit) return `Map showing your location in ${home}`;
    const place = destinationLocation(exit) ?? "the exit node";
    const hops = hopCount();
    const relay = hops > 0
      ? `, relayed through ${hops} hop${hops === 1 ? "" : "s"}`
      : "";
    return `Map showing the connection from ${
      home ?? "your location"
    } to ${place}${relay}`;
  });

  return (
    <WorldMap
      homeCode={homeCode()}
      homePoint={homeRegion()?.point}
      exitPoint={exitLocation()?.point}
      routes={routes()}
      routeKey={routeKey()}
      connected={isConnected()}
      label={label()}
    />
  );
}
