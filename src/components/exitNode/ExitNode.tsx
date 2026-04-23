import { useAppStore } from "../../stores/appStore.ts";
import { Dropdown } from "../common/Dropdown.tsx";
import {
  destinationLabel,
  destinationLabelById,
  destinationsForTargetSelection,
  selectTargetId,
} from "../../utils/destinations.ts";
import type { Destination } from "../../services/vpnService.ts";
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { useSettingsStore } from "../../stores/settingsStore.ts";
import {
  formatLatency,
  getHopCount,
  isNodeUnreachable,
} from "../../utils/exitHealth.ts";
import HopsIcon from "./HopsIcon.tsx";
import Tooltip from "../common/Tooltip.tsx";

type AutoOption = { type: "auto" };
type ExitOption = Destination | AutoOption;
const AUTO_OPTION: AutoOption = { type: "auto" };

export default function ExitNode() {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const sortedDestinations = createMemo(() => {
    if (settings.exitNodeSortOrder === "alpha") {
      return [...appState.availableDestinations].sort((a, b) => {
        const aUnreachable = isNodeUnreachable(appState.destinations[a.id]);
        const bUnreachable = isNodeUnreachable(appState.destinations[b.id]);
        if (aUnreachable !== bUnreachable) return aUnreachable ? 1 : -1;
        return destinationLabel(a).localeCompare(destinationLabel(b));
      });
    }
    return destinationsForTargetSelection(
      undefined,
      appState.availableDestinations,
      appState.destinations,
    );
  });

  const availableIds = createMemo(
    () => new Set(appState.availableDestinations.map((d) => d.id)),
  );

  const [frozenList, setFrozenList] = createSignal<Destination[] | null>(null);
  let clearFrozenTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  onCleanup(() => globalThis.clearTimeout(clearFrozenTimeout));

  createEffect(
    on(
      () => settings.exitNodeSortOrder,
      () => {
        if (frozenList() !== null) setFrozenList([...sortedDestinations()]);
      },
      { defer: true },
    ),
  );

  const resolvedAutoDestination = createMemo(() => {
    const candidates = destinationsForTargetSelection(
      undefined,
      appState.availableDestinations,
      appState.destinations,
    );
    if (candidates.length === 0) return null;

    const { id } = selectTargetId(
      undefined,
      settings.preferredLocation,
      candidates,
    );

    if (!id) return null;
    return candidates.find((d) => d.id === id) ?? null;
  });

  // Created once at component init — outside any reactive tracking.
  // Reusing the same DOM node in renderValue means SolidJS moves it (DOM adoption)
  // rather than recreating it on every status tick, so the Tooltip's visible
  // signal survives across re-renders.
  const autoTooltipLabel = (
    <Tooltip content="Preferred or best available" position="top" tabIndex={0}>
      <span class="flex items-center gap-1 font-bold">
        Auto
        <span class="text-xs font-light text-text-secondary cursor-default">
          ⓘ
        </span>
      </span>
    </Tooltip>
  );

  return (
    <div class="w-full flex flex-row bg-bg-surface rounded-2xl p-4">
      <Dropdown<ExitOption>
        label="Exit Node"
        options={[AUTO_OPTION, ...(frozenList() ?? sortedDestinations())]}
        header={() => (
          <div class="flex items-center justify-between">
            <span class="text-xs text-text-secondary uppercase tracking-wider">
              Sort by
            </span>
            <div class="flex gap-1">
              {(
                [
                  { order: "latency", label: "Latency" },
                  { order: "alpha", label: "A–Z" },
                ] as const
              ).map(({ order, label }) => (
                <button
                  type="button"
                  class={`text-xs px-2 py-0.5 rounded-md font-semibold transition-colors ${
                    settings.exitNodeSortOrder === order
                      ? "bg-accent text-accent-text"
                      : "bg-white/8 text-text-secondary hover:text-text-primary"
                  }`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape" && e.key !== "Tab") {
                      e.stopPropagation();
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void settingsActions.setExitNodeSortOrder(order);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        onOpen={() => {
          globalThis.clearTimeout(clearFrozenTimeout);
          setFrozenList([...sortedDestinations()]);
        }}
        onClose={() => {
          // 210 ms: slightly after Dropdown's 200 ms unmount timeout, so frozenList
          // is cleared after the portal is gone rather than during the animation.
          clearFrozenTimeout = globalThis.setTimeout(
            () => setFrozenList(null),
            210,
          );
        }}
        renderOption={(opt: ExitOption) => {
          if ("id" in opt) {
            const ds = appState.destinations[opt.id];
            const routeHealth = ds?.route_health;
            const latency = routeHealth ? formatLatency(routeHealth) : null;
            const hops = getHopCount(opt.routing);
            return (
              <span
                class={`flex items-center justify-between gap-2${
                  latency ? "" : " opacity-40"
                }`}
              >
                <span class="flex items-center gap-1.5 min-w-0">
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
          const resolvedDest = resolvedAutoDestination();
          const resolvedDs = resolvedDest
            ? appState.destinations[resolvedDest.id]
            : null;
          const resolvedLatency = resolvedDs?.route_health
            ? formatLatency(resolvedDs.route_health)
            : null;
          return (
            <span class="flex flex-col gap-0.5 w-full">
              <span
                class="flex items-center gap-1.5"
                title="Preferred or best available"
              >
                Auto
                <Tooltip
                  content="Preferred or best available"
                  position="top"
                  tabIndex={-1}
                >
                  <span class="text-xs font-light text-text-secondary cursor-default">
                    ⓘ
                  </span>
                </Tooltip>
              </span>
              {resolvedDest && (
                <span class="flex items-center gap-1.5 text-xs text-text-secondary">
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
          ) ?? { id: appState.selectedId })
          : AUTO_OPTION) as ExitOption}
        onChange={(opt: ExitOption) => {
          const current = appState.selectedId;
          if ("id" in opt) {
            if (current === opt.id) {
              return;
            }
            if (!availableIds().has(opt.id)) {
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
        isOptionDisabled={(opt: ExitOption) =>
          "id" in opt && !availableIds().has(opt.id)}
        renderValue={(opt: ExitOption) => {
          if ("id" in opt) {
            return (
              <span class="flex items-center gap-1.5">
                <span class="break-all">
                  {destinationLabelById(opt.id, appState.availableDestinations)}
                </span>
              </span>
            );
          }
          const resolvedDest = resolvedAutoDestination();
          if (resolvedDest) {
            const ds = appState.destinations[resolvedDest.id];
            const routeHealth = ds?.route_health;
            const latency = routeHealth ? formatLatency(routeHealth) : null;
            return (
              <span class="flex flex-col">
                {autoTooltipLabel}
                <span class="flex items-center gap-1.5 text-xs text-text-secondary font-light break-all">
                  {destinationLabel(resolvedDest)}
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
