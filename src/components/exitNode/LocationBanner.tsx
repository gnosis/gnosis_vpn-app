import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { Portal } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  cardPhaseFor,
  type DestinationEntry,
  effectiveActive,
  orderedEntries,
  SWITCH_ANIMATE_MS,
  SWITCH_CROSSOVER_MS,
} from "@src/stores/destinationMode.ts";
import { reconcileStrip } from "@src/utils/cardStrip.ts";
import { cardTitle, isVpnActive } from "@src/utils/destinations.ts";
import DetailCard from "./DetailCard.tsx";
import ExitNodeList from "./ExitNodeList.tsx";

// Must match .banner-card-pulse's animation-duration in index.css — the
// outgoing card shrinks then grows back before the slide starts. Counts
// against SWITCH_ANIMATE_MS's total, not on top of it — see animateAutoSwitch.
const CARD_PULSE_MS = 600;
// A settle only ever moves to the adjacent card, so it's a quick snap rather
// than the cross-strip glide SWITCH_ANIMATE_MS is tuned for.
const SETTLE_ANIMATE_MS = 300;
// Swallows any trailing `scroll` events the browser dispatches asynchronously
// right after a programmatic scrollLeft write, so they don't get mistaken for
// a user settling on a card once suppression lifts.
const SETTLE_GRACE_MS = 50;
// How long to wait for scroll silence before treating a native touch swipe as
// settled, on browsers without a `scrollend` event to tell us directly.
const SCROLL_SETTLE_DEBOUNCE_MS = 140;
const DRAG_THRESHOLD_PX = 6;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateScrollLeft(
  el: HTMLElement,
  to: number,
  duration: number,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const from = el.scrollLeft;
  const delta = to - from;
  if (delta === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (isCancelled()) {
        resolve();
        return;
      }
      const progress = Math.min((now - start) / duration, 1);
      el.scrollLeft = from + delta * easeOutCubic(progress);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

// Hands scroll styles back to CSS while re-pinning the landed position — WebKitGTK's returning mandatory snap can yank the strip to its remembered card
function restoreScrollStyles(container: HTMLDivElement, to: number) {
  container.style.scrollSnapType = "";
  container.scrollLeft = to;
  container.style.scrollBehavior = "";
  // re-snap can land a frame later; correct it once if it moved the strip
  requestAnimationFrame(() => {
    if (Math.abs(container.scrollLeft - to) <= 1) return;
    container.scrollLeft = to;
  });
}

// An already-deliberate choice jumps rather than replaying the auto-switch slide; scroll-behavior needs overriding too, or scroll-smooth animates the write like a swipe.
function jumpToCard(container: HTMLDivElement, id: string): void {
  const card = container.querySelector<HTMLElement>(
    `[data-destination-id="${id}"]`,
  );
  if (!card) return;
  container.style.scrollBehavior = "auto";
  container.style.scrollSnapType = "none";
  const to = centeredScrollLeft(container, card);
  container.scrollLeft = to;
  restoreScrollStyles(container, to);
}

// Where scrollLeft must land for `card` to sit centered in `container` —
// computed from live rects rather than offsetLeft so it doesn't depend on
// container being card's offsetParent.
function centeredScrollLeft(container: HTMLDivElement, card: Element): number {
  const containerRect = container.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const cardOffset = cardRect.left - containerRect.left + container.scrollLeft;
  return cardOffset - (container.clientWidth - cardRect.width) / 2;
}

// Whichever card's center sits closest to the container's center right now.
function nearestCardId(container: HTMLDivElement): string | null {
  const containerCenter = container.getBoundingClientRect().left +
    container.clientWidth / 2;
  let nearestCard: Element | undefined;
  let nearestDistance = Infinity;
  for (const card of container.children) {
    const rect = card.getBoundingClientRect();
    const distance = Math.abs(rect.left + rect.width / 2 - containerCenter);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCard = card;
    }
  }
  return nearestCard?.getAttribute("data-destination-id") ?? null;
}

// Auto mode's candidate becoming active once its countdown (the headline
// SwitchSpinner) elapses: the outgoing card pulses, then the strip slides to
// center the candidate — mirroring the model's own settleAt, which commits
// activeId SWITCH_CROSSOVER_MS into this same window, i.e. partway through
// the slide phase below rather than during the pulse.
async function animateAutoSwitch(
  container: HTMLDivElement,
  outgoingId: string,
  candidateId: string,
  isCancelled: () => boolean,
) {
  const outgoingCard = container.querySelector<HTMLElement>(
    `[data-destination-id="${outgoingId}"]`,
  );
  if (outgoingCard) {
    outgoingCard.classList.add("banner-card-pulse");
    await new Promise((resolve) => setTimeout(resolve, CARD_PULSE_MS));
    outgoingCard.classList.remove("banner-card-pulse");
  }
  if (isCancelled()) return;

  const card = container.querySelector<HTMLElement>(
    `[data-destination-id="${candidateId}"]`,
  );
  if (!card) return;
  container.style.scrollBehavior = "auto";
  container.style.scrollSnapType = "none";
  const to = centeredScrollLeft(container, card);
  await animateScrollLeft(
    container,
    to,
    SWITCH_ANIMATE_MS - CARD_PULSE_MS,
    isCancelled,
  );
  restoreScrollStyles(container, to);
}

export default function LocationBanner() {
  const [appState, appActions] = useAppStore();
  // The model can close the list itself — an unsolicited connection, or a prune taking the active card.
  const showList = () => appState.mode.listOpen;
  // Viewport Y of the button that opened the list — the expand animation's origin.
  const [listOriginY, setListOriginY] = createSignal(0);

  let containerRef: HTMLDivElement | undefined;
  let mounted = true;
  onCleanup(() => {
    mounted = false;
  });

  // Set for the duration of any scrollLeft write *we* make (plus a trailing
  // grace period) so the settle listeners below don't mistake our own
  // animation for a user swipe — see commitSlideTo's doc comment for why
  // that distinction matters.
  // Depth-counted: suppression windows overlap (e.g. a settle racing a jump), and a boolean would lift too early
  let suppressDepth = 0;
  const suppressSettle = () => suppressDepth > 0;
  const runSuppressed = async (fn: () => Promise<void> | void) => {
    suppressDepth++;
    try {
      await fn();
      await new Promise((resolve) => setTimeout(resolve, SETTLE_GRACE_MS));
    } finally {
      suppressDepth--;
    }
  };

  // Touch already gets native pan-to-scroll from the browser. Mouse/pen
  // don't — overflow-x-auto alone only lets them drag the (now hidden)
  // scrollbar thumb — so we drive scrollLeft by hand for those pointer
  // types. dragStartX doubles as "is a mouse/pen button currently down".
  let dragStartX: number | undefined;
  let dragStartScrollLeft = 0;
  let didDrag = false;
  // The button (real <button> or a custom role="button" div, e.g. the
  // health row's expand toggle) a gesture started on, if any — a drag must
  // be able to start from on top of a button same as anywhere else in a
  // slide, so pointerdown can't just skip tracking there. Replayed manually
  // in endDrag when the gesture turns out to be a tap, since
  // setPointerCapture below retargets the native click away from wherever
  // the gesture actually started.
  let pendingClickTarget: HTMLElement | null = null;
  // Which slide (by id) a gesture started on, if any — lets a tap on a
  // peeking neighbor's visible sliver switch to it (see animateSwitchTo)
  // without needing its own separate click handler, which pointer capture
  // below would swallow the same way it would a button's.
  let pendingCardId: string | null = null;

  const handlePointerDown = (e: PointerEvent) => {
    if (!containerRef || e.pointerType === "touch") return;
    // WebKitGTK edge-autoscrolls the scroller during a native mouse drag once the cursor leaves it, fighting our scrollLeft writes (= the jitter) — cancel the engine's own gesture
    // (also suppresses click-focus: deliberate, programmatic focus() here painted a focus ring; keyboard users still Tab to the cards)
    e.preventDefault();
    const target = e.target instanceof Element ? e.target : null;
    pendingClickTarget =
      target?.closest<HTMLElement>('button, [role="button"]') ??
        null;
    pendingCardId =
      target?.closest<HTMLElement>("[data-destination-id]")?.dataset
        .destinationId ?? null;
    dragStartX = e.clientX;
    dragStartScrollLeft = containerRef.scrollLeft;
    didDrag = false;
    // Guards a pointer the browser no longer considers active (e.g. already
    // released) — capture is a nice-to-have so the drag keeps tracking
    // outside the container's bounds, not a precondition for dragging.
    try {
      containerRef.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (dragStartX === undefined || !containerRef) return;
    const dx = e.clientX - dragStartX;
    if (!didDrag) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      didDrag = true;
      appActions.dragStarted();
      // Both need overriding for the drag to track the pointer 1:1: smooth
      // scroll-behavior animates every step instead of jumping straight to
      // it, and mandatory scroll-snap silently reverts any scrollLeft that
      // isn't already a snap point (so nothing between cards ever sticks).
      containerRef.style.scrollBehavior = "auto";
      containerRef.style.scrollSnapType = "none";
    }
    containerRef.scrollLeft = dragStartScrollLeft - dx;
  };

  // Always reaches the model, even landing back where it started — the gesture suspended auto and only this ends it.
  const commitSlideTo = (id: string) => {
    const wasElsewhere = effectiveActive(appState.mode, Date.now()) !== id;
    // a stale id is a peek at a vanished card, not a connect attempt
    const stillOffered = appState.availableDestinations.some((d) =>
      d.id === id
    );
    appActions.slideCommitted(id);

    if (!wasElsewhere || !stillOffered) return;
    // re-pointing the display cannot retarget a live tunnel; only a real connect can
    if (!isVpnActive(appState.vpnStatus, appState.targetDestination)) return;
    void appActions.connect(id);
  };

  // Animates the strip to center `id`'s card, then commits it — shared by
  // drag-release settle, native-scroll settle, and arrow-key navigation so
  // all three land on the model the same way.
  const animateSettleTo = async (id: string) => {
    if (!containerRef) return;
    const card = containerRef.querySelector<HTMLElement>(
      `[data-destination-id="${id}"]`,
    );
    if (!card) return;
    const container = containerRef;
    await runSuppressed(async () => {
      container.style.scrollBehavior = "auto";
      container.style.scrollSnapType = "none";
      const to = centeredScrollLeft(container, card);
      await animateScrollLeft(container, to, SETTLE_ANIMATE_MS, () => !mounted);
      restoreScrollStyles(container, to);
    });
    commitSlideTo(id);
  };

  // Tapping a peeking neighbor's visible sliver — the "usual rules" for a
  // switch: a SWITCH_ANIMATE_MS (1s) slide, committed at SWITCH_CROSSOVER_MS
  // (0.5s) into it rather than at the end, same crossover point the
  // auto-switch countdown uses (see destinationMode.ts). Deliberately
  // separate from animateSettleTo — that one commits only once its (faster,
  // uncrossed-over) animation finishes.
  const animateSwitchTo = (id: string) => {
    if (!containerRef) return;
    const card = containerRef.querySelector<HTMLElement>(
      `[data-destination-id="${id}"]`,
    );
    if (!card) return;
    const container = containerRef;
    const commitTimer = setTimeout(
      () => commitSlideTo(id),
      SWITCH_CROSSOVER_MS,
    );
    void runSuppressed(async () => {
      container.style.scrollBehavior = "auto";
      container.style.scrollSnapType = "none";
      const to = centeredScrollLeft(container, card);
      await animateScrollLeft(container, to, SWITCH_ANIMATE_MS, () => !mounted);
      restoreScrollStyles(container, to);
    }).finally(() => clearTimeout(commitTimer));
  };

  const settleToNearestCard = () => {
    if (!containerRef) return;
    const id = nearestCardId(containerRef);
    if (id) {
      void animateSettleTo(id);
    } else {
      // No card to settle to (shouldn't normally happen) — still need to
      // hand scroll-behavior/snap back to native CSS ourselves, since
      // nothing else will now that endDrag no longer does it unconditionally.
      containerRef.style.scrollBehavior = "";
      containerRef.style.scrollSnapType = "";
    }
  };

  const endDrag = () => {
    if (dragStartX === undefined || !containerRef) {
      dragStartX = undefined;
      return;
    }
    dragStartX = undefined;
    // Not reset here even though the drag overrode them — settleToNearestCard
    // (and its animation) takes over the transition immediately and owns
    // restoring them once it's actually done. Resetting scroll-snap-type
    // here first would hand it back to the browser a frame early, letting
    // native mandatory snap jump the position instantly before our own
    // animation gets a chance to take over smoothly.
    // ExitHealthDetail turns its *entire* row into a role="button" toggle
    // for a bigger, more forgiving tap target — but that only makes sense
    // for the already-active card. On a peeking neighbor, the same tap
    // should switch to that card instead of silently toggling its (barely
    // visible) detail panel. A real <button> (e.g. the list-open icon)
    // isn't subject to that ambiguity, so it always fires as tapped.
    const isRealButton = pendingClickTarget?.tagName === "BUTTON";
    // Compares against what's actually centered right now, not the model's
    // activeId — an in-flight auto-switch (animateAutoSwitch commits only
    // once the model's own settleAt timer fires, not as it animates) can
    // leave those two disagreeing about which card is "current", which
    // previously made a tap on the very first peeking neighbor a no-op.
    const tappedPeekingCard = containerRef && pendingCardId &&
      pendingCardId !== nearestCardId(containerRef);

    if (didDrag) {
      settleToNearestCard();
    } else if (pendingClickTarget && isRealButton) {
      pendingClickTarget.click();
    } else if (tappedPeekingCard) {
      animateSwitchTo(pendingCardId!);
    } else if (pendingClickTarget) {
      pendingClickTarget.click();
    }
    pendingClickTarget = null;
    pendingCardId = null;
  };

  // Native touch swipes never go through the pointer handlers above, so they
  // need their own settle signal. Prefer `scrollend` (fires once, exactly
  // when scrolling truly stops) where supported; otherwise fall back to
  // debouncing `scroll` events. Either way, bail while a mouse/pen drag is
  // in progress (that gesture commits explicitly via endDrag) or while
  // suppressSettle marks the scroll as one of our own writes.
  const supportsScrollEnd = "onscrollend" in window;
  let scrollDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  const handleSettledScroll = () => {
    if (suppressSettle() || dragStartX !== undefined || !containerRef) return;
    const id = nearestCardId(containerRef);
    if (id) commitSlideTo(id);
  };

  const handleScroll = () => {
    if (suppressSettle() || dragStartX !== undefined) return;
    // a touch swipe suspends auto for its duration, same as a mouse drag
    if (!appState.mode.dragging) appActions.dragStarted();
    if (supportsScrollEnd) return;
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(
      handleSettledScroll,
      SCROLL_SETTLE_DEBOUNCE_MS,
    );
  };

  onMount(() => {
    containerRef?.addEventListener("scroll", handleScroll);
    if (supportsScrollEnd) {
      containerRef?.addEventListener("scrollend", handleSettledScroll);
    }
  });

  onCleanup(() => {
    clearTimeout(scrollDebounceTimer);
    containerRef?.removeEventListener("scroll", handleScroll);
    if (supportsScrollEnd) {
      containerRef?.removeEventListener("scrollend", handleSettledScroll);
    }
  });

  // Entries in history order (oldest -> newest); empty until the first status update.
  const entriesInOrder = () => orderedEntries(appState.mode);

  // Must match the mount fade's `duration-700` below — a removed entry
  // (e.g. a cancelled auto-switch candidate) fades out over the same
  // duration it would have faded in with, instead of vanishing instantly.
  const CARD_EXIT_FADE_MS = 700;

  // What <For> renders: the model's entries, plus ones that just dropped out of
  // it, kept in their old slot until their fade-out finishes. Keyed by
  // `entry.key`, not destination id — a re-picked destination gets a fresh key.
  const [displayEntries, setDisplayEntries] = createSignal<DestinationEntry[]>(
    [],
  );
  const [exitingKeys, setExitingKeys] = createSignal<ReadonlySet<number>>(
    new Set(),
  );

  const activeId = () => appState.mode.active;

  const activeKey = (): number | null => {
    const active = appState.mode.active;
    return active === null ? null : appState.mode.entries[active]?.key ?? null;
  };

  createEffect((prev: { keys: number[]; activeKey: number | null }) => {
    const modelEntries = entriesInOrder();
    // untracked: this effect follows the model, not the list it writes back
    const frame = reconcileStrip(
      untrack(displayEntries),
      modelEntries,
      prev.keys,
      prev.activeKey,
    );
    setDisplayEntries(frame.shown);

    if (frame.fadingKeys.length > 0) {
      setExitingKeys((cur) => new Set([...cur, ...frame.fadingKeys]));
      for (const key of frame.fadingKeys) {
        setTimeout(() => {
          setExitingKeys((cur) => {
            if (!cur.has(key)) return cur;
            const next = new Set(cur);
            next.delete(key);
            return next;
          });
          setDisplayEntries((cur) => cur.filter((e) => e.key !== key));
        }, CARD_EXIT_FADE_MS);
      }
    }

    return { keys: modelEntries.map((e) => e.key), activeKey: activeKey() };
  }, { keys: entriesInOrder().map((e) => e.key), activeKey: activeKey() });

  const slideToAdjacent = (id: string, direction: 1 | -1) => {
    const order = entriesInOrder().map((e) => e.id);
    const nextId = order[order.indexOf(id) + direction];
    if (nextId) void animateSettleTo(nextId);
  };

  // The strip centres the active card, which is not necessarily the last one; an auto switch animates itself, so only changes we did not animate jump here.
  // Microtask-deferred: entries and mode are two store writes in one transition and this effect can run between them.
  createEffect((prevActiveId: string | null | undefined) => {
    const activeId = appState.mode.active;
    if (prevActiveId !== undefined && activeId !== prevActiveId && activeId) {
      const container = containerRef;
      queueMicrotask(() => {
        if (!container || containerRef !== container) return;
        if (suppressSettle()) return;
        void runSuppressed(() =>
          Promise.resolve(jumpToCard(container, activeId))
        );
      });
    }
    return activeId;
  }, undefined);

  // Rule 7's UI half: once a pending candidate's countdown (the headline
  // SwitchSpinner) elapses, play the pulse-then-slide switch so it lands
  // centered right as the model commits activeId to it, SWITCH_CROSSOVER_MS
  // later — see animateAutoSwitch. Scheduled off countdownEndsAt directly
  // rather than reacting to the commit itself, since entries/activeId don't
  // change at countdownEndsAt (only at settleAt, after this animation ends).
  createEffect(() => {
    const mode = appState.mode.mode;
    if (mode.mode !== "auto" || !mode.pending || !containerRef) return;
    const { candidateId, countdownEndsAt } = mode.pending;
    const outgoingId = appState.mode.active;
    if (!outgoingId) return;
    const container = containerRef;
    const timer = setTimeout(() => {
      void runSuppressed(() =>
        animateAutoSwitch(container, outgoingId, candidateId, () => !mounted)
      );
    }, Math.max(0, countdownEndsAt - Date.now()));
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        class="w-full flex flex-row gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth cursor-grab select-none active:cursor-grabbing"
      >
        {
          /* Leading/trailing spacer, not container padding — padding would
            permanently inset every slide, not just give the first/last one
            room to still center. 10px (not 18) because the existing gap-2
            auto-supplies the other 8px between this and the adjacent card. */
        }
        <div class="w-[10px] shrink-0" aria-hidden="true" />
        <For each={displayEntries()}>
          {(entry) => (
            <Show when={appState.destinations[entry.id]}>
              {(ds) => (
                <div
                  data-destination-id={entry.id}
                  class="relative w-[calc(100%-36px)] shrink-0 snap-center transition-opacity duration-700 ease-out"
                  classList={{
                    "opacity-0": exitingKeys().has(entry.key),
                    // the card the user just chose must not fade in under them
                    "starting:opacity-0": entry.id !== activeId(),
                  }}
                  aria-label="Exit node, use left and right arrow keys to browse"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") {
                      e.preventDefault();
                      slideToAdjacent(entry.id, 1);
                    }
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      slideToAdjacent(entry.id, -1);
                    }
                  }}
                >
                  <DetailCard
                    destinationState={ds()}
                    title={cardTitle(cardPhaseFor(appState.mode, entry.id))}
                    fadeTitle={entry.id === activeId()}
                    switchEndsAt={entry.id === activeId() &&
                        appState.mode.mode.mode === "auto"
                      ? appState.mode.mode.pending?.countdownEndsAt ?? null
                      : null}
                    onOpenList={(originY) => {
                      setListOriginY(originY);
                      appActions.destinationListOpened();
                    }}
                  />
                </div>
              )}
            </Show>
          )}
        </For>
        <div class="w-[10px] shrink-0" aria-hidden="true" />
      </div>

      <Portal>
        <Show when={showList()}>
          <ExitNodeList
            originY={listOriginY()}
            onClose={(picked) => appActions.destinationListClosed(picked)}
          />
        </Show>
      </Portal>
    </>
  );
}
