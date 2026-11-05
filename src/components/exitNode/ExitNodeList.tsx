import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import {
  connectionDestination,
  type Destination,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { autoCandidate } from "@src/stores/destinationMode.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { logInfo } from "@src/utils/appLog.ts";
import {
  exitDisplayName,
  exitShortId,
  isReady,
  isReadyForDisplay,
  isSelectable,
  isVpnActive,
  pickerRows,
  rankContext,
  type RouteGrade,
  routeGrade,
  sortAlphaDestinations,
  sortByRouteQuality,
} from "@src/utils/destinations.ts";
import PageHeader from "../common/PageHeader.tsx";
import LocationRow, { ACTION_BUTTON, ShortId } from "./LocationRow.tsx";

const ROW_LIMIT = 5;

/** Everything the list shows that a status update can change. */
interface ListView {
  // ids, so <For> keeps a row, and a focused button, when only its grade changes
  rows: string[];
  exits: Record<string, { destination: Destination; grade: RouteGrade }>;
  more: boolean;
  autoPick: Destination | null;
  autoOn: boolean;
  connected: boolean;
}

export default function ExitNodeList(props: {
  // the destination chosen, or null when the list was dismissed
  onClose: (picked: string | null) => void;
}) {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const [query, setQuery] = createSignal("");
  const [showAll, setShowAll] = createSignal(false);

  let searchInputRef: HTMLInputElement | undefined;

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (query()) {
        setQuery("");
      } else {
        props.onClose(null);
      }
    }
  }

  onMount(() => {
    searchInputRef?.focus();
    document.addEventListener("keydown", handleKeyDown);
  });
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  const sortedDestinations = createMemo(() => {
    const context = rankContext(appState);
    // the same ranking auto picks from, so the list's head is the destination it would choose
    const best = () =>
      sortByRouteQuality(appState.destinations, context)
        .map((id) => appState.destinations[id].destination);
    switch (settings.exitNodeSortOrder) {
      case "alpha":
        return sortAlphaDestinations(
          appState.availableDestinations,
          appState.destinations,
          context,
        );
      case "recent":
        // a search looks past the history, as the mock's does
        return query().trim()
          ? best()
          : settings.recentDestinations.flatMap((id) => {
            const state = appState.destinations[id];
            return state ? [state.destination] : [];
          });
      default:
        return best();
    }
  });

  // frozenList updates only on membership changes or explicit sort-order toggles;
  // health-only updates are intentionally ignored to avoid reordering nodes while
  // the user is interacting with the list.
  const [frozenList, setFrozenList] = createSignal(sortedDestinations());

  createEffect(
    on(
      () => settings.exitNodeSortOrder,
      () => setFrozenList([...sortedDestinations()]),
      { defer: true },
    ),
  );

  createEffect(() => {
    const next = sortedDestinations();
    const prevIds = new Set(untrack(frozenList).map((d) => d.id));
    const membershipChanged = prevIds.size !== next.length ||
      next.some((d) => !prevIds.has(d.id));
    if (membershipChanged) setFrozenList([...next]);
  });

  const isUsable = (id: string) =>
    isSelectable(appState.destinations[id], rankContext(appState)) &&
    appState.availableDestinations.some((d) => d.id === id);

  const liveAutoPick = () => {
    const id = autoCandidate(appState, appState.mode.preferredLocation);
    const state = id === null ? undefined : appState.destinations[id];
    // with nothing ready the candidate is only the sort head, a cold-start card's fallback
    return state && isReadyForDisplay(state, rankContext(appState))
      ? state.destination
      : null;
  };

  const liveView = createMemo((): ListView => {
    // the exit we are on has nothing to connect to; auto's pick stays listed
    const connectedId = connectionDestination(appState.connection);
    const { rows, more } = pickerRows(frozenList(), {
      query: query(),
      excludeId: connectedId,
      isUsable,
      limit: showAll() ? null : ROW_LIMIT,
    });
    const context = rankContext(appState);
    const autoPick = liveAutoPick();
    const exits: ListView["exits"] = {};
    for (const destination of rows) {
      exits[destination.id] = {
        destination,
        grade: routeGrade(
          appState.destinations[destination.id],
          context,
          appState.weakRoutes[destination.id]?.surfaced ?? false,
        ),
      };
    }
    return {
      rows: rows.map((destination) => destination.id),
      exits,
      more,
      autoPick,
      // Nothing records whether a tunnel was auto's choice, so connected it is "On" while it is auto's pick right now.
      autoOn: connectedId === null
        ? appState.mode.mode.mode === "auto"
        : connectedId === autoPick?.id,
      connected: isVpnActive(appState.vpnStatus, appState.targetDestination),
    };
  });

  // Status updates wait while the pointer is over the list, so rows never move under it.
  const [hovering, setHovering] = createSignal(false);
  const [view, setView] = createSignal(untrack(liveView));
  createEffect(() => {
    const next = liveView();
    if (!hovering()) setView(next);
  });
  // the user's own changes show at once, pointer or not
  createEffect(
    on(
      [query, showAll, () => settings.exitNodeSortOrder],
      () => setView(liveView()),
      { defer: true },
    ),
  );

  const showAuto = () =>
    settings.exitNodeSortOrder === "best" && !query().trim();
  const emptyText = () =>
    settings.exitNodeSortOrder === "recent" &&
      settings.recentDestinations.length === 0
      ? "No exits used yet. They show up here once you connect."
      : "No other exits are available right now.";

  const handleConnect = (id: string) => {
    const liveOrLeaving = connectionDestination(appState.connection) === id ||
      appState.disconnecting.some((d) => d.destination === id);
    // its tunnel exists or is going away; picking it only brings its card back
    if (!liveOrLeaving) {
      // the view holds still under the pointer, so the exit may have gone or filled since it was drawn
      if (!isUsable(id)) return;
      logInfo(`Connecting from the list: ${id}`);
      void appActions.connect(id);
    }
    props.onClose(id);
  };

  const isConnected = () => connectionDestination(appState.connection) !== null;

  // the pick on screen, while the live status still has it ready
  const autoTarget = () => {
    const pick = view().autoPick;
    return pick &&
        isReady(appState.destinations[pick.id], rankContext(appState))
      ? pick.id
      : null;
  };

  // connected, Use switches to the pick on screen, as the mock does; disconnected, it hands back to auto
  const useAuto = () => {
    if (!isConnected()) {
      appActions.autoResumed();
      return;
    }
    const target = autoTarget();
    if (target !== null) handleConnect(target);
  };

  const sortOptions = [
    { order: "best" as const, label: "Best" },
    { order: "recent" as const, label: "Recent" },
    { order: "alpha" as const, label: "A–Z" },
  ];

  return (
    <div class="fixed inset-0 z-100 bg-bg-primary text-text-primary flex flex-col outline-none page-slide-in">
      <PageHeader title="Choose location" onBack={() => props.onClose(null)} />

      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 pt-1 pb-4">
        <div class="relative shrink-0">
          <svg
            class="pointer-events-none absolute top-2.25 left-2.25 text-text-subtle"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="7" />
            <path d="M16 16l5 5" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            aria-label="Search locations"
            placeholder="Search"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            class="h-7.5 w-full rounded-lg bg-control-bg pr-2.25 pl-6.5 text-xs placeholder:text-text-subtle outline-none focus:outline-2 focus:outline-text-link"
          />
        </div>

        <div
          role="group"
          aria-label="Sort by"
          class="flex shrink-0 gap-0.5 self-start rounded-lg bg-control-bg p-0.5"
        >
          <For each={sortOptions}>
            {({ order, label }) => (
              <button
                type="button"
                aria-pressed={settings.exitNodeSortOrder === order}
                class={`rounded-md px-1.5 py-1.25 text-[11px] leading-3.5 font-bold hover:cursor-pointer ${
                  settings.exitNodeSortOrder === order
                    ? "bg-bg-list shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
                    : "text-text-subtle hover:text-text-primary"
                }`}
                onClick={() => void settingsActions.setExitNodeSortOrder(order)}
              >
                {label}
              </button>
            )}
          </For>
        </div>

        <div
          class="shrink-0"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <Show
            when={showAuto() || view().rows.length > 0 || query().trim()}
            fallback={
              <p class="px-2.5 py-4 text-center text-[10.5px] text-text-subtle">
                {emptyText()}
              </p>
            }
          >
            <div
              role="group"
              aria-label="Locations"
              class="flex flex-col gap-0.5 rounded-xl bg-bg-list p-1.5"
            >
              <Show when={showAuto()}>
                <div class="flex min-h-14.5 items-center gap-3 rounded-[10px] p-2.5 hover:bg-row-hover">
                  <span
                    class="h-5.25 w-7.5 shrink-0 rounded bg-auto-mark"
                    aria-hidden="true"
                  />
                  <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <span class="text-sm leading-[1.2] font-bold">Auto</span>
                    <span class="text-xs text-text-subtle">
                      Picks the best for you
                    </span>
                    <Show when={view().autoPick}>
                      {(pick) => (
                        <span class="truncate text-xs text-text-subtle">
                          {exitDisplayName(pick())}
                          <ShortId id={exitShortId(pick().address)} />
                        </span>
                      )}
                    </Show>
                  </div>
                  <Show
                    when={view().autoOn}
                    fallback={
                      <button
                        type="button"
                        class={ACTION_BUTTON}
                        aria-label="Use automatic location"
                        disabled={isConnected() && autoTarget() === null}
                        onClick={useAuto}
                      >
                        Use
                      </button>
                    }
                  >
                    <span class="shrink-0 rounded-full bg-control-bg px-1.75 py-0.5 text-[10px] leading-3 font-bold">
                      On
                    </span>
                  </Show>
                </div>
              </Show>

              <For each={view().rows}>
                {(id) => (
                  <LocationRow
                    destination={view().exits[id].destination}
                    grade={view().exits[id].grade}
                    actionLabel={view().connected ? "Switch" : "Connect"}
                    disabled={appState.isLoading || !isUsable(id)}
                    onAction={() => handleConnect(id)}
                  />
                )}
              </For>

              <Show when={view().more}>
                <button
                  type="button"
                  class="self-center py-0.5 text-[13px] leading-4 font-bold text-text-link hover:cursor-pointer"
                  onClick={() => setShowAll(true)}
                >
                  Show all exits
                </button>
              </Show>

              <Show when={query().trim() && view().rows.length === 0}>
                <p class="px-2.5 py-4 text-center text-[10.5px] text-text-subtle">
                  No exit matches “{query().trim()}”.
                </p>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
