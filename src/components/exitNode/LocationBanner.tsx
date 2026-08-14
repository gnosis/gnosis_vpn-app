import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  currentDisplayId,
  type DestinationEntry,
  type DestinationModel,
  SWITCH_ANIMATE_MS,
  SWITCH_COUNTDOWN_MS,
  SWITCH_CROSSOVER_MS,
} from "@src/stores/destinationMode.ts";
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

// Manually picking a destination from the list is already a deliberate,
// already-seen choice — jump straight to its card instead of replaying the
// pulse-then-slide reserved for an unattended auto-switch. scroll-behavior
// must be overridden too, not just scroll-snap — the container's
// scroll-smooth class would otherwise animate this scrollLeft write exactly
// like a user-driven scroll.
function jumpToLatest(container: HTMLDivElement) {
  container.style.scrollBehavior = "auto";
  container.style.scrollSnapType = "none";
  container.scrollLeft = container.scrollWidth - container.clientWidth;
  container.style.scrollBehavior = "";
  container.style.scrollSnapType = "";
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
  await animateScrollLeft(
    container,
    centeredScrollLeft(container, card),
    SWITCH_ANIMATE_MS - CARD_PULSE_MS,
    isCancelled,
  );
  container.style.scrollBehavior = "";
  container.style.scrollSnapType = "";
}

export default function LocationBanner() {
  const [appState, appActions] = useAppStore();
  const [showList, setShowList] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;
  let mounted = true;
  onCleanup(() => {
    mounted = false;
  });

  // Set for the duration of any scrollLeft write *we* make (plus a trailing
  // grace period) so the settle listeners below don't mistake our own
  // animation for a user swipe — see commitSlideTo's doc comment for why
  // that distinction matters.
  let suppressSettle = false;
  const runSuppressed = async (fn: () => Promise<void> | void) => {
    suppressSettle = true;
    await fn();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_GRACE_MS));
    suppressSettle = false;
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
      // Both need overriding for the drag to track the pointer 1:1: smooth
      // scroll-behavior animates every step instead of jumping straight to
      // it, and mandatory scroll-snap silently reverts any scrollLeft that
      // isn't already a snap point (so nothing between cards ever sticks).
      containerRef.style.scrollBehavior = "auto";
      containerRef.style.scrollSnapType = "none";
    }
    containerRef.scrollLeft = dragStartScrollLeft - dx;
  };

  // Picking a destination this way — settling on it, whether by drag
  // release, native touch swipe, or arrow key — always means "make this the
  // active destination", the same intent as scrolling to a card in
  // docs/destination-mode.md's rule 10. If a connection is already live,
  // re-pointing the display isn't enough (setActiveEntry is a no-op while
  // connecting by design — see rule 13): a real connect() has to retarget
  // it, and the model catches up once the backend confirms (rule 12).
  const commitSlideTo = (id: string) => {
    if (currentDisplayId(appState.mode) === id) return;
    if (isVpnActive(appState.vpnStatus, appState.targetDestination)) {
      // Mirrors ExitNodeList's handleCardClick: only attempt a retarget for
      // a destination we actually still know about — a stale id is a peek,
      // not a connect attempt.
      if (!appState.availableDestinations.some((d) => d.id === id)) return;
      void appActions.connect(id);
    } else {
      appActions.setActiveEntry(id);
    }
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
      await animateScrollLeft(
        container,
        centeredScrollLeft(container, card),
        SETTLE_ANIMATE_MS,
        () => !mounted,
      );
      container.style.scrollBehavior = "";
      container.style.scrollSnapType = "";
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
      await animateScrollLeft(
        container,
        centeredScrollLeft(container, card),
        SWITCH_ANIMATE_MS,
        () => !mounted,
      );
      container.style.scrollBehavior = "";
      container.style.scrollSnapType = "";
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
    if (suppressSettle || dragStartX !== undefined || !containerRef) return;
    const id = nearestCardId(containerRef);
    if (id) commitSlideTo(id);
  };

  const handleScroll = () => {
    if (supportsScrollEnd) return;
    if (suppressSettle || dragStartX !== undefined) return;
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

  // Entries in history order (oldest -> newest); empty before startup
  // resolves.
  const modeEntries = () =>
    appState.mode.phase === "uninitialized" ? [] : appState.mode.entries;

  // Must match the mount fade's `duration-700` below — a removed entry
  // (e.g. a cancelled auto-switch candidate) fades out over the same
  // duration it would have faded in with, instead of vanishing instantly.
  const CARD_EXIT_FADE_MS = 700;

  // What <For> actually renders: `modeEntries()` plus any entry that just
  // dropped out of it, kept around (and marked via `exitingKeys`) until its
  // fade-out finishes. New entries need no such bookkeeping — their fade-in
  // is handled entirely by the starting:opacity-0 CSS below, so they can join
  // immediately. Tracked by `entry.key` rather than destination id — picking
  // a destination that's already elsewhere in history mints a fresh key for
  // it (see pickDestination), so it mounts here as a new card instead of
  // reconciling into, and silently repositioning, the old one.
  const [displayEntries, setDisplayEntries] = createSignal<DestinationEntry[]>(
    [],
  );
  const [exitingKeys, setExitingKeys] = createSignal<ReadonlySet<number>>(
    new Set(),
  );

  createEffect((prevKeys: number[]) => {
    const nextEntries = modeEntries();
    const nextKeys = nextEntries.map((e) => e.key);
    const removedKeys = prevKeys.filter((key) => !nextKeys.includes(key));

    if (removedKeys.length > 0) {
      setExitingKeys((cur) => {
        const next = new Set(cur);
        removedKeys.forEach((key) => next.add(key));
        return next;
      });
      for (const key of removedKeys) {
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

    // Preserve existing slots (including ones still fading out) rather than
    // appending everything anew, so a removal doesn't reshuffle neighbors.
    setDisplayEntries((cur) => {
      const stillPresent = cur.filter((e) =>
        nextKeys.includes(e.key) || removedKeys.includes(e.key)
      );
      const stillPresentKeys = stillPresent.map((e) => e.key);
      const withNew = nextEntries.filter((e) =>
        !stillPresentKeys.includes(e.key)
      );
      return [...stillPresent, ...withNew];
    });

    return nextKeys;
  }, modeEntries().map((e) => e.key));

  const slideToAdjacent = (id: string, direction: 1 | -1) => {
    const order = modeEntries().map((e) => e.id);
    const nextId = order[order.indexOf(id) + direction];
    if (nextId) void animateSettleTo(nextId);
  };

  // Tracking the last id (not just order.length) also catches a reselected
  // historical entry moving to the end, which leaves the length unchanged.
  //
  // A rule-5 candidate append (mode.pending.candidateId === lastId, not yet
  // activeId) is deliberately excluded here — during its 5s countdown
  // nothing about the strip should move; it just sits there peeking until
  // either the countdown effect below slides to it, or it reverts and
  // disappears again. Every other new-last-entry case (a pick, a startup/
  // connecting landing) is already-active the instant it appears, so a
  // straight jump is enough — the pulse-then-slide announcement is reserved
  // for the timed auto-switch.
  //
  // The isUnsettledCandidate check is deferred to a microtask rather than
  // read inline here — entries/pending are two separate store writes within
  // one model transition, mirrored into this component's store through an
  // intermediate reconcile() bridge (appStore's mode → state.mode), and that
  // bridge can flush this very effect while only one of the two has landed.
  // Queuing the decision lets the whole synchronous reactive cascade settle
  // first, so it reads entries/pending as they'll actually stay.
  createEffect((prevLastId: string | null | undefined) => {
    const order = modeEntries().map((e) => e.id);
    const lastId = order.length > 0 ? order[order.length - 1] : null;
    if (prevLastId !== undefined && lastId !== prevLastId && containerRef) {
      const container = containerRef;
      queueMicrotask(() => {
        if (containerRef !== container) return;
        const mode = appState.mode;
        const isUnsettledCandidate = mode.phase === "auto" &&
          mode.pending?.candidateId === lastId;
        if (!isUnsettledCandidate) {
          void runSuppressed(() => Promise.resolve(jumpToLatest(container)));
        }
      });
    }
    return lastId;
  }, undefined);

  // Keeps the pre-revert title ("Selected Location") on screen through the
  // auto candidate-detection window after a `selected` -> `auto` revert
  // (rule 11/16), instead of instantly flipping to "Best Location" only to
  // maybe slide away to a different card a moment later — see
  // docs/destination-mode.md's note on this delay. Cleared once its card is
  // provably done deciding: it moved on to a different (better) card, or the
  // flat SWITCH_COUNTDOWN_MS deadline passed with no pending candidate left
  // to resolve.
  const [revealHold, setRevealHold] = createSignal<
    { activeId: string; holdEndsAt: number } | null
  >(null);

  const releaseHoldIfSettled = () => {
    const hold = revealHold();
    if (!hold) return;
    const mode = appState.mode;
    if (mode.phase !== "auto" || mode.activeId !== hold.activeId) {
      setRevealHold(null);
      return;
    }
    if (mode.pending === null && Date.now() >= hold.holdEndsAt) {
      setRevealHold(null);
    }
  };

  createEffect((prevPhase: DestinationModel["phase"] | undefined) => {
    const mode = appState.mode;
    if (prevPhase === "selected" && mode.phase === "auto") {
      const activeId = mode.activeId;
      setRevealHold({ activeId, holdEndsAt: Date.now() + SWITCH_COUNTDOWN_MS });
      // The deadline passing is a pure time event, not a store change — the
      // reactive effect below only re-checks on the next entries/pending/
      // activeId change, which may not happen right at the deadline (e.g. no
      // candidate ever shows up).
      const timer = setTimeout(releaseHoldIfSettled, SWITCH_COUNTDOWN_MS);
      onCleanup(() => clearTimeout(timer));
    }
    return mode.phase;
  }, undefined);

  createEffect(() => {
    const mode = appState.mode;
    if (mode.phase === "auto") {
      // Read so this reruns when a pending candidate commits (activeId
      // changes) or cancels (pending -> null) after the flat deadline above
      // already elapsed while it was still in flight.
      mode.activeId;
      mode.pending;
    }
    releaseHoldIfSettled();
  });

  const resolvedTitle = () => {
    const mode = appState.mode;
    const hold = revealHold();
    const isHeld = hold !== null && mode.phase === "auto" &&
      mode.activeId === hold.activeId;
    return cardTitle(isHeld ? "selected" : mode.phase);
  };

  // Rule 7's UI half: once a pending candidate's countdown (the headline
  // SwitchSpinner) elapses, play the pulse-then-slide switch so it lands
  // centered right as the model commits activeId to it, SWITCH_CROSSOVER_MS
  // later — see animateAutoSwitch. Scheduled off countdownEndsAt directly
  // rather than reacting to the commit itself, since entries/activeId don't
  // change at countdownEndsAt (only at settleAt, after this animation ends).
  createEffect(() => {
    const mode = appState.mode;
    if (mode.phase !== "auto" || !mode.pending || !containerRef) return;
    const { candidateId, countdownEndsAt } = mode.pending;
    const outgoingId = mode.activeId;
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
                  class="relative w-[calc(100%-36px)] shrink-0 snap-center transition-opacity duration-700 ease-out starting:opacity-0"
                  classList={{ "opacity-0": exitingKeys().has(entry.key) }}
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
                    title={resolvedTitle()}
                    switchEndsAt={entry.id ===
                          currentDisplayId(appState.mode) &&
                        appState.mode.phase === "auto"
                      ? appState.mode.pending?.countdownEndsAt ??
                        revealHold()?.holdEndsAt ?? null
                      : null}
                    onOpenList={() => setShowList(true)}
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
          <ExitNodeList onClose={() => setShowList(false)} />
        </Show>
      </Portal>
    </>
  );
}
