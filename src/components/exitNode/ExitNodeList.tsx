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
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import {
  destinationLabel,
  resolveAutoDestination,
  sortAlphaDestinations,
  sortByHealthScore,
} from "@src/utils/destinations.ts";
import ExitNodeCard from "./ExitNodeCard.tsx";
import UnreachableDialog from "./UnreachableDialog.tsx";

export default function ExitNodeList(props: { onClose: () => void }) {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const [query, setQuery] = createSignal("");
  const [showUnreachable, setShowUnreachable] = createSignal(false);

  let searchInputRef: HTMLInputElement | undefined;

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (showUnreachable()) {
        setShowUnreachable(false);
      } else if (query()) {
        setQuery("");
      } else {
        props.onClose();
      }
    }
  }

  onMount(() => {
    searchInputRef?.focus();
    document.addEventListener("keydown", handleKeyDown);
  });
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  const resolvedAutoDestination = createMemo(() =>
    resolveAutoDestination(
      appState.availableDestinations,
      appState.destinations,
      settings.preferredLocation,
    )
  );

  const sortedDestinations = createMemo(() => {
    if (settings.exitNodeSortOrder === "alpha") {
      return sortAlphaDestinations(
        appState.availableDestinations,
        appState.destinations,
      );
    }
    return sortByHealthScore(
      appState.availableDestinations,
      appState.destinations,
    );
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

  const filtered = createMemo(() => {
    const q = query().toLowerCase();
    const list = frozenList();
    if (!q) return list;
    return list.filter((d) => destinationLabel(d).toLowerCase().includes(q));
  });

  // Includes Disconnecting so that picking a new node while tearing down
  // the old tunnel still triggers connect().
  const vpnActive = () =>
    appState.vpnStatus === "Connected" || appState.vpnStatus === "Connecting" ||
    appState.vpnStatus === "Disconnecting";

  const isAvailable = (id: string) =>
    appState.availableDestinations.some((d) => d.id === id);

  // Independent clock: ExitNodeList is a full-screen overlay mounted separately from
  // ExitHealthDetail (which runs its own clock in MainScreen).
  const [nowSec, setNowSec] = createSignal(Date.now() / 1000);
  const tick = setInterval(() => setNowSec(Date.now() / 1000), 1000);
  onCleanup(() => clearInterval(tick));

  const handleSelectAuto = () => {
    if (appState.selectedId === null) {
      props.onClose();
      return;
    }
    if (
      vpnActive() &&
      (resolvedAutoDestination()?.id ===
          (appState.connected ?? appState.connecting?.destination_id) ||
        appState.disconnecting.some(
          (d) => d.destination_id === resolvedAutoDestination()?.id,
        ))
    ) {
      appActions.chooseDestination(null);
      props.onClose();
      return;
    }
    appActions.chooseDestination(null);
    if (vpnActive() && resolvedAutoDestination()) void appActions.connect();
    props.onClose();
  };

  const handleCardClick = (id: string) => {
    if (
      appState.connected === id ||
      appState.connecting?.destination_id === id ||
      appState.disconnecting.some((d) => d.destination_id === id)
    ) {
      if (appState.selectedId !== id) appActions.chooseDestination(id);
      props.onClose();
      return;
    }
    if (!isAvailable(id)) {
      setShowUnreachable(true);
      return;
    }
    appActions.chooseDestination(id);
    if (vpnActive()) void appActions.connect();
    props.onClose();
  };

  const sortOptions = [
    { order: "latency" as const, label: "Latency" },
    { order: "alpha" as const, label: "A–Z" },
  ];

  return (
    <div class="fixed inset-0 z-100 bg-bg-primary flex flex-col outline-none">
      <div class="flex items-center w-full gap-2 px-3 py-3 border-b border-border shrink-0">
        <button
          type="button"
          class="rounded-md p-1 hover:bg-bg-surface absolute left-2 my-auto"
          aria-label="Back"
          onClick={() => props.onClose()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="h-5 w-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h1 class="text-text-primary text-lg font-bold text-center flex-1">
          Exit Node
        </h1>
      </div>

      <div class="px-3 pt-2 pb-1 shrink-0">
        <input
          ref={searchInputRef}
          type="text"
          aria-label="Search exit nodes"
          placeholder="Search for Location or Exit Node"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          class="w-full bg-bg-surface rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-1 focus:ring-text-secondary"
        />
      </div>

      <div class="flex items-center justify-end gap-2 px-3 py-2 shrink-0">
        <span class="text-xs text-text-secondary uppercase tracking-wider">
          Sort by
        </span>
        <div class="flex gap-1">
          <For each={sortOptions}>
            {({ order, label }) => (
              <button
                type="button"
                class={`text-xs px-2 py-0.5 rounded-md font-semibold transition-colors ${
                  settings.exitNodeSortOrder === order
                    ? "bg-accent text-accent-text"
                    : "bg-white/8 text-text-secondary hover:text-text-primary"
                }`}
                onClick={() => void settingsActions.setExitNodeSortOrder(order)}
              >
                {label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div
        class="flex-1 overflow-y-auto pb-3 flex flex-col gap-1"
        role="group"
        aria-label="Exit node options"
      >
        <Show when={!query()}>
          <div
            class={`relative w-full bg-bg-surface-alt px-4 py-3 cursor-pointer hover:bg-bg-surface transition-colors ${
              appState.selectedId === null ? "border-b border-border" : ""
            }`}
            onClick={handleSelectAuto}
            onKeyDown={(e) => e.key === "Enter" && handleSelectAuto()}
            role="button"
            tabIndex={0}
          >
            <Show when={appState.selectedId === null}>
              <div
                class="absolute inset-y-0 left-0 w-1 bg-text-muted"
                aria-hidden
              />
            </Show>
            <div class="flex flex-col">
              <span class="font-semibold text-sm text-text-primary">Auto</span>
              <Show when={resolvedAutoDestination()}>
                {(dest) => (
                  <span class="text-xs text-text-secondary break-all">
                    {destinationLabel(dest())}
                  </span>
                )}
              </Show>
            </div>
          </div>
        </Show>

        <For each={filtered()}>
          {(dest) => (
            <ExitNodeCard
              destinationState={() =>
                appState.destinations[dest.id] ??
                  ({
                    destination: dest,
                    route_health: null,
                  } as DestinationState)}
              isSelected={appState.selectedId === dest.id}
              nowSec={nowSec}
              onClick={() => handleCardClick(dest.id)}
            />
          )}
        </For>

        <Show when={query() && filtered().length === 0}>
          <p class="px-4 py-8 text-center text-sm text-text-secondary">
            No results for "{query()}"
          </p>
        </Show>
      </div>

      <Show when={showUnreachable()}>
        <UnreachableDialog onClose={() => setShowUnreachable(false)} />
      </Show>
    </div>
  );
}
