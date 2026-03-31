import { useAppStore } from "../../stores/appStore.ts";
import { Dropdown } from "../common/Dropdown.tsx";
import { destinationLabel, selectTargetId } from "../../utils/destinations.ts";
import type {
  Destination,
  DestinationHealth,
} from "../../services/vpnService.ts";
import { createMemo, Show } from "solid-js";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import ExitHealthBadge from "./ExitHealthBadge.tsx";
import {
  formatLatency,
  getHopCount,
  sortByHealthScore,
} from "../../utils/exitHealth.ts";
import HopsIcon from "./HopsIcon.tsx";
import { getConnectionLabel } from "../../utils/status.ts";
import Tooltip from "../common/Tooltip.tsx";

type RandomOption = { type: "random" };
type ExitOption = Destination | RandomOption;
const RANDOM_OPTION: RandomOption = { type: "random" };

export default function ExitNode() {
  const [appState, appActions] = useAppStore();
  const [settings] = useSettingsStore();

  const sortedDestinations = createMemo(() =>
    sortByHealthScore(appState.availableDestinations, appState.destinations)
  );

  const randomDestination = createMemo(() => {
    const available = sortedDestinations();
    if (available.length === 0) return null;

    const { id } = selectTargetId(
      undefined,
      settings.preferredLocation,
      available,
    );

    if (!id) return null;
    return available.find((d) => d.id === id) ?? null;
  });

  // Created once at component init — outside any reactive tracking.
  // Reusing the same DOM node in renderValue means SolidJS moves it (DOM adoption)
  // rather than recreating it on every status tick, so the Tooltip's visible
  // signal survives across re-renders.
  const autoTooltipLabel = (
    <Tooltip content="Preferred or best available" position="top">
      <span class="flex items-center gap-1 font-bold">
        Auto
        <span class="text-xs font-light text-text-secondary cursor-default">
          ⓘ
        </span>
      </span>
    </Tooltip>
  ) as HTMLElement;

  return (
    <div class="w-full flex flex-row bg-bg-surface rounded-2xl p-4">
      <Dropdown<ExitOption>
        label="Exit Node"
        options={[RANDOM_OPTION, ...sortedDestinations()]}
        renderOption={(opt: ExitOption) => {
          if ("id" in opt) {
            const ds = appState.destinations[opt.id];
            const exitHealth: DestinationHealth | undefined = ds?.exit_health;
            const latency = exitHealth ? formatLatency(exitHealth) : null;
            const hops = getHopCount(opt.routing);
            const connected = ds
              ? getConnectionLabel(ds.connection_state) === "Connected"
              : false;
            return (
              <span class="flex items-center justify-between gap-2">
                <span class="flex items-center gap-1.5 min-w-0">
                  <span class="w-4 shrink-0 flex items-center justify-center">
                    {exitHealth && (
                      <ExitHealthBadge
                        exitHealth={exitHealth}
                        compact
                        connected={connected}
                      />
                    )}
                  </span>
                  <span class="break-all">{destinationLabel(opt)}</span>
                </span>
                <span class="shrink-0 text-xs text-text-secondary flex items-center gap-2">
                  {latency && (
                    <span class="tabular-nums" title="Latency">
                      {latency}
                    </span>
                  )}
                  <Show when={hops !== 1}>
                    <HopsIcon count={hops} />
                  </Show>
                </span>
              </span>
            );
          }
          const resolvedDest = randomDestination();
          const resolvedDs = resolvedDest
            ? appState.destinations[resolvedDest.id]
            : null;
          const resolvedLatency = resolvedDs?.exit_health
            ? formatLatency(resolvedDs.exit_health)
            : null;
          return (
            <span class="flex flex-col gap-0.5 w-full">
              <span class="flex items-center gap-1.5">
                <span class="w-4 shrink-0" />
                Auto
                <Tooltip content="Preferred or best available" position="top">
                  <span class="text-xs font-light text-text-secondary cursor-default">
                    ⓘ
                  </span>
                </Tooltip>
              </span>
              {resolvedDest && (
                <span class="flex items-center gap-1.5 pl-5 text-xs text-text-secondary">
                  {resolvedDs?.exit_health && (
                    <ExitHealthBadge
                      exitHealth={resolvedDs.exit_health}
                      compact
                      connected={false}
                    />
                  )}
                  {destinationLabel(resolvedDest)}
                  {resolvedLatency && (
                    <span class="tabular-nums">{resolvedLatency}</span>
                  )}
                </span>
              )}
            </span>
          );
        }}
        value={(appState.selectedId
          ? (appState.availableDestinations.find((d) =>
            d.id === appState.selectedId
          ) ?? RANDOM_OPTION)
          : RANDOM_OPTION) as ExitOption}
        onChange={(opt: ExitOption) => {
          const current = appState.selectedId;
          if ("id" in opt) {
            if (current === opt.id) {
              return;
            }
            appActions.chooseDestination(opt.id);
          } else {
            if (current !== null) {
              appActions.chooseDestination(null);
            }
          }
        }}
        itemToString={(opt: ExitOption) => {
          if ("id" in opt) {
            return destinationLabel(opt);
          }
          return "Auto";
        }}
        isOptionDisabled={() => false}
        renderValue={(opt: ExitOption) => {
          if ("id" in opt) {
            const ds = appState.destinations[opt.id];
            const exitHealth: DestinationHealth | undefined = ds?.exit_health;
            const connected = ds
              ? getConnectionLabel(ds.connection_state) === "Connected"
              : false;
            return (
              <span class="flex items-center gap-1.5">
                {exitHealth && (
                  <ExitHealthBadge
                    exitHealth={exitHealth}
                    compact
                    connected={connected}
                  />
                )}
                <span class="break-all">{destinationLabel(opt)}</span>
              </span>
            );
          }
          const randomDest = randomDestination();
          if (randomDest) {
            const ds = appState.destinations[randomDest.id];
            const exitHealth: DestinationHealth | undefined = ds?.exit_health;
            const latency = exitHealth ? formatLatency(exitHealth) : null;
            const connected = ds
              ? getConnectionLabel(ds.connection_state) === "Connected"
              : false;
            return (
              <span class="flex flex-col">
                {autoTooltipLabel}
                <span class="flex items-center gap-1.5 text-xs text-text-secondary font-light break-all">
                  {exitHealth && (
                    <ExitHealthBadge
                      exitHealth={exitHealth}
                      compact
                      connected={connected}
                    />
                  )}
                  {destinationLabel(randomDest)}
                  {latency && <span class="tabular-nums">{latency}</span>}
                </span>
              </span>
            );
          }
          return autoTooltipLabel;
        }}
        placeholder="Auto"
        disabled={appState.isLoading ||
          appState.vpnStatus === "ServiceUnavailable"}
      />
    </div>
  );
}
