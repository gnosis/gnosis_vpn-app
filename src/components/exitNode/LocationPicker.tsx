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
import { Portal } from "solid-js/web";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { effectiveActive } from "@src/stores/destinationMode.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
import {
  destinationLabel,
  isVpnActive,
  rankContext,
  sortAlphaDestinations,
  sortByRouteQuality,
} from "@src/utils/destinations.ts";
import LocationRow from "./LocationRow.tsx";
import UnreachableDialog from "./UnreachableDialog.tsx";

// Fallback width when no frame is given; the frame normally sets it.
const DEFAULT_WIDTH_PX = 270;
// Distance from the window edge the popover keeps, and from the anchor to the arrow tip.
const MARGIN_PX = 8;
const GAP_PX = 10;
const ARROW_PX = 12;
// Gap kept above the primary button.
const BOTTOM_GAP_PX = 10;

/** The column the popover spans (the status card's edges) and the y it must not pass. */
export interface PickerFrame {
  left: number;
  width: number;
  maxBottom: number;
}

/** The next index in `direction` that passes `ok`, wrapping; `from` when nothing does. */
function step<T>(
  items: T[],
  from: number,
  direction: 1 | -1,
  ok: (item: T, index: number) => boolean,
): number {
  for (let n = 1; n <= items.length; n++) {
    const i = (from + direction * n + items.length) % items.length;
    if (ok(items[i], i)) return i;
  }
  return from;
}

/** A popover under its anchor: search, arrow keys, Enter to pick, Esc or a click outside to close. */
export default function LocationPicker(props: {
  // Where the opening button sits; the arrow points at its middle.
  anchor: DOMRect;
  // The edges to span and the floor to stop at; without it, centred under the anchor.
  frame: PickerFrame | null;
  // The destination chosen, or null when the picker was dismissed.
  onClose: (picked: string | null) => void;
}) {
  const [appState, appActions] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const [query, setQuery] = createSignal("");
  const [highlight, setHighlight] = createSignal(0);
  const [showUnreachable, setShowUnreachable] = createSignal(false);

  let popoverRef: HTMLDivElement | undefined;
  let listRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  const sortedDestinations = createMemo(() => {
    const context = rankContext(appState);
    if (settings.exitNodeSortOrder === "alpha") {
      return sortAlphaDestinations(
        appState.availableDestinations,
        appState.destinations,
        context,
      );
    }
    // the same ranking auto picks from, so the list's head is the destination it would choose
    return sortByRouteQuality(appState.destinations, context)
      .map((id) => appState.destinations[id].destination);
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

  const stateOf = (id: string, fallback: DestinationState["destination"]) =>
    appState.destinations[id] ??
      ({ destination: fallback, route_health: null } as DestinationState);
  const currentId = () => effectiveActive(appState.mode, Date.now());
  const isPickable = (i: number) =>
    listRef?.children[i]?.getAttribute("data-pickable") === "true";

  // The highlight starts on the current location and follows the filter.
  onMount(() => {
    const i = filtered().findIndex((d) => d.id === currentId());
    setHighlight(Math.max(0, i));
  });
  createEffect(on(query, () => setHighlight(0), { defer: true }));
  createEffect(() => {
    const row = listRef?.children[highlight()];
    row?.scrollIntoView({ block: "nearest" });
  });

  const vpnActive = () =>
    isVpnActive(appState.vpnStatus, appState.targetDestination);
  const isAvailable = (id: string) =>
    appState.availableDestinations.some((d) => d.id === id);

  const pick = (id: string) => {
    if (
      appState.connected?.destination_id === id ||
      appState.connecting?.destination_id === id ||
      appState.reconnecting?.destination_id === id ||
      appState.disconnecting.some((d) => d.destination_id === id)
    ) {
      logInfo(`Destination ${id} already active, closing list`);
      props.onClose(id);
      return;
    }
    if (!isAvailable(id)) {
      logWarn(`Unreachable destination selected: ${id}`);
      setShowUnreachable(true);
      return;
    }
    logInfo(`Destination selected from list: ${id}`);
    if (vpnActive()) void appActions.connect(id);
    props.onClose(id);
  };

  const onSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => step(filtered(), h, dir, (_, i) => isPickable(i)));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const target = filtered()[highlight()];
      if (target && isPickable(highlight())) pick(target.id);
    }
  };

  // Esc closes (the dialog first, if it is up); a press outside closes too.
  const onDocumentKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (showUnreachable()) setShowUnreachable(false);
    else props.onClose(null);
  };
  const onDocumentPointerDown = (e: PointerEvent) => {
    const target = e.target instanceof Node ? e.target : null;
    if (showUnreachable()) return;
    if (target && popoverRef?.contains(target)) return;
    props.onClose(null);
  };
  onMount(() => {
    searchInputRef?.focus();
    // capture: the opening button's own click must not reach us as "outside"
    document.addEventListener("keydown", onDocumentKeyDown, true);
    setTimeout(
      () => document.addEventListener("pointerdown", onDocumentPointerDown),
      0,
    );
  });
  onCleanup(() => {
    document.removeEventListener("keydown", onDocumentKeyDown, true);
    document.removeEventListener("pointerdown", onDocumentPointerDown);
  });

  // Spans the frame's column; without one, centred under the anchor and kept inside the window.
  const anchorX = () => props.anchor.left + props.anchor.width / 2;
  const width = () => props.frame?.width ?? DEFAULT_WIDTH_PX;
  const left = () =>
    props.frame?.left ??
      Math.max(
        MARGIN_PX,
        Math.min(
          anchorX() - width() / 2,
          globalThis.innerWidth - width() - MARGIN_PX,
        ),
      );
  const top = () => props.anchor.bottom + GAP_PX;
  // Down to just above the primary button; the list scrolls inside beyond that.
  const maxHeight = () => {
    const floor = props.frame?.maxBottom ?? globalThis.innerHeight;
    return Math.max(120, floor - BOTTOM_GAP_PX - top());
  };
  const arrowLeft = () => anchorX() - left() - ARROW_PX / 2;

  const sortOptions = [
    { order: "best" as const, label: "Best" },
    { order: "alpha" as const, label: "A–Z" },
  ];

  return (
    <Portal>
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Choose location"
        class="fixed z-100 flex flex-col rounded-xl border border-border bg-bg-surface shadow-xl transition-[opacity,transform] duration-150 ease-out starting:-translate-y-1 starting:opacity-0"
        style={{
          left: `${left()}px`,
          top: `${top()}px`,
          width: `${width()}px`,
          "max-height": `${maxHeight()}px`,
        }}
      >
        <span
          class="absolute -top-[7px] size-3 rotate-45 border-l border-t border-border bg-bg-surface"
          style={{ left: `${arrowLeft()}px` }}
          aria-hidden="true"
        />
        <div class="flex shrink-0 items-center gap-1.5 p-2">
          <div class="relative min-w-0 flex-1">
            <svg
              viewBox="0 0 24 24"
              class="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text-muted"
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
              placeholder="Search locations"
              autocomplete="off"
              spellcheck={false}
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={onSearchKeyDown}
              class="h-7 w-full rounded-md border border-border bg-bg-primary pl-6 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-transparent focus:outline-2 focus:outline-accent"
            />
          </div>
          <div class="flex shrink-0 gap-0.5" role="group" aria-label="Sort by">
            <For each={sortOptions}>
              {({ order, label }) => (
                <button
                  type="button"
                  aria-pressed={settings.exitNodeSortOrder === order}
                  class="rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
                  classList={{
                    "bg-accent text-accent-text":
                      settings.exitNodeSortOrder === order,
                    "text-text-secondary hover:bg-darken":
                      settings.exitNodeSortOrder !== order,
                  }}
                  onClick={() =>
                    void settingsActions.setExitNodeSortOrder(order)}
                >
                  {label}
                </button>
              )}
            </For>
          </div>
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label="Locations"
          class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5"
        >
          <For each={filtered()}>
            {(dest, i) => (
              <LocationRow
                destinationState={stateOf(dest.id, dest)}
                current={dest.id === currentId()}
                highlighted={i() === highlight()}
                onHover={() => setHighlight(i())}
                onPick={() => pick(dest.id)}
              />
            )}
          </For>
          <Show when={filtered().length === 0}>
            <p class="px-2 pb-2 pt-1 text-xs text-text-secondary">
              No locations match.
            </p>
          </Show>
        </div>
      </div>

      <Show when={showUnreachable()}>
        <div class="fixed inset-0 z-110">
          <UnreachableDialog onClose={() => setShowUnreachable(false)} />
        </div>
      </Show>
    </Portal>
  );
}
