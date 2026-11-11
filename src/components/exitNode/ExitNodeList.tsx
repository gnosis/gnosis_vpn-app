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
import { requestConnect } from "@src/stores/exitCost.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
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
import LocationRow, {
  ACTION_BUTTON,
  ListRow,
  ShortId,
} from "./LocationRow.tsx";

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
        return query().trim() ? best() : appState.recent.flatMap((id) => {
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
      // connected, "On" means auto was on when this tunnel came up
      autoOn: connectedId === null
        ? appState.mode.mode.mode === "auto"
        : appState.mode.mode.mode === "live" && appState.mode.mode.auto,
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
      appState.recent.length === 0
      ? "No exits used yet. They show up here once you connect."
      : "No other exits are available right now.";

  // its tunnel exists or is going away; picking it only brings its card back
  const liveOrLeaving = (id: string) =>
    connectionDestination(appState.connection) === id ||
    appState.disconnecting.some((d) => d.destination === id);

  // not view().connected: a tunnel that ended under the pointer would turn a connect into a switch MainScreen drops
  const connectedNow = () =>
    isVpnActive(appState.vpnStatus, appState.targetDestination);

  // the row's Connect / Switch button; both may first show the exit's cost on the card
  const connectTo = (id: string) => {
    if (liveOrLeaving(id)) {
      props.onClose(id);
      return;
    }
    // the view holds still under the pointer, so the exit may have gone or filled since it was drawn
    if (!isUsable(id)) return;
    if (connectedNow()) {
      // the card keeps the tunnel's exit until the switch is confirmed
      props.onClose(null);
      requestConnect(id, { switching: true, auto: false });
      return;
    }
    props.onClose(id);
    requestConnect(id);
  };
  // a click on the row while disconnected: the main screen's Connect goes there later
  const select = (id: string) => {
    if (liveOrLeaving(id) || isUsable(id)) props.onClose(id);
  };

  // the pick on screen, while the live status still has it ready
  const autoTarget = () => {
    const pick = view().autoPick;
    return pick &&
        isReady(appState.destinations[pick.id], rankContext(appState))
      ? pick.id
      : null;
  };

  // connects to the pick on screen; the tunnel is auto's, so it hands back to auto once it ends
  const connectAuto = () => {
    const target = autoTarget();
    if (target === null) return;
    // already on auto's pick: the tunnel only becomes auto's
    if (liveOrLeaving(target)) {
      appActions.autoResumed();
      return;
    }
    if (!isUsable(target)) return;
    if (connectedNow()) {
      props.onClose(null);
      requestConnect(target, { switching: true, auto: true });
      return;
    }
    appActions.autoResumed();
    // auto picks from the latest status, which may rank past the row frozen under the pointer
    const picked = appState.mode.active;
    if (picked !== null && isUsable(picked)) requestConnect(picked);
  };

  const sortOptions = [
    { order: "best" as const, label: "Best" },
    { order: "recent" as const, label: "Recent" },
    { order: "alpha" as const, label: "A–Z" },
  ];

  return (
    <div class="fixed inset-0 z-100 bg-bg-primary text-text-primary flex flex-col outline-none transition-transform duration-220 ease-[cubic-bezier(0.2,0.8,0.2,1)] starting:translate-x-full motion-reduce:transition-none">
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
                <ListRow
                  selectLabel="Use automatic location"
                  // like the exit rows: disconnected, the row's body selects
                  onSelect={view().connected || view().autoOn
                    ? undefined
                    : () => appActions.autoResumed()}
                  action={
                    // Disconnected, Auto keeps its Connect even while it is the choice; a tunnel already auto's needs no Switch


                      <Show when={!(view().autoOn && view().connected)}>
                        <button
                          type="button"
                          class={ACTION_BUTTON}
                          aria-label={`${
                            view().connected ? "Switch" : "Connect"
                          } to automatic location`}
                          disabled={appState.isLoading || autoTarget() === null}
                          onClick={connectAuto}
                        >
                          {view().connected ? "Switch" : "Connect"}
                        </button>
                      </Show>

                  }
                >
                  <span
                    class="h-5.25 w-7.5 shrink-0 rounded bg-auto-mark"
                    aria-hidden="true"
                  />
                  <span class="flex min-w-0 flex-1 flex-col gap-1">
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
                  </span>
                  <Show when={view().autoOn}>
                    <span class="shrink-0 rounded-full bg-control-bg px-1.75 py-0.5 text-[10px] leading-3 font-bold">
                      On
                    </span>
                  </Show>
                </ListRow>
              </Show>

              <For each={view().rows}>
                {(id) => (
                  <LocationRow
                    destination={view().exits[id].destination}
                    grade={view().exits[id].grade}
                    actionLabel={view().connected ? "Switch" : "Connect"}
                    disabled={appState.isLoading || !isUsable(id)}
                    onAction={() => connectTo(id)}
                    onSelect={view().connected ? undefined : () => select(id)}
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
