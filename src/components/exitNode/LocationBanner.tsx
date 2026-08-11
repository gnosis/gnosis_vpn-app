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
import { currentDisplayId } from "@src/stores/destinationMode.ts";
import { isVpnActive } from "@src/utils/destinations.ts";
import LocationBannerCard from "./LocationBannerCard.tsx";
import ExitNodeList from "./ExitNodeList.tsx";

// Must match .banner-card-pulse's animation-duration in index.css — the
// outgoing card shrinks then grows back before the slide starts.
const CARD_PULSE_MS = 600;
// Slower than a native smooth-scroll so the motion reads as a deliberate
// slide rather than a jump.
const SLIDE_MS = 1500;
// A settle only ever moves to the adjacent card, so it's a quick snap rather
// than the cross-strip glide SLIDE_MS is tuned for.
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

// Shrinks-then-grows the outgoing card (signalling "this is about to
// change"), then glides the container to the newest card. Scroll-snap and
// smooth scroll-behavior are suspended for the glide — they fight direct
// scrollLeft assignment the same way they fight manual drag (see
// handlePointerMove below).
async function slideToLatest(
  container: HTMLDivElement,
  prevActiveId: string | null,
  isCancelled: () => boolean,
) {
  const prevCard = prevActiveId
    ? container.querySelector<HTMLElement>(
      `[data-destination-id="${prevActiveId}"]`,
    )
    : null;
  if (prevCard) {
    prevCard.classList.add("banner-card-pulse");
    await new Promise((resolve) => setTimeout(resolve, CARD_PULSE_MS));
    prevCard.classList.remove("banner-card-pulse");
  }
  if (isCancelled()) return;

  container.style.scrollBehavior = "auto";
  container.style.scrollSnapType = "none";
  // The browser clamps scrollLeft writes to scrollWidth - clientWidth, not
  // scrollWidth itself — animating toward the unclamped value would have
  // our eased progress hit that ceiling (and visually stop) well before
  // SLIDE_MS has actually elapsed.
  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  await animateScrollLeft(container, maxScrollLeft, SLIDE_MS, isCancelled);
  container.style.scrollBehavior = "";
  container.style.scrollSnapType = "";
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

  const handlePointerDown = (e: PointerEvent) => {
    if (!containerRef || e.pointerType === "touch") return;
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
      container.style.scrollSnapType = "none";
      await animateScrollLeft(
        container,
        centeredScrollLeft(container, card),
        SETTLE_ANIMATE_MS,
        () => !mounted,
      );
      container.style.scrollSnapType = "";
    });
    commitSlideTo(id);
  };

  const settleToNearestCard = () => {
    if (!containerRef) return;
    const id = nearestCardId(containerRef);
    if (id) void animateSettleTo(id);
  };

  const endDrag = () => {
    if (dragStartX === undefined || !containerRef) {
      dragStartX = undefined;
      return;
    }
    dragStartX = undefined;
    containerRef.style.scrollBehavior = "";
    containerRef.style.scrollSnapType = "";
    if (didDrag) settleToNearestCard();
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

  // Ids in history order (oldest -> newest); empty before startup resolves.
  const entryIds = () =>
    appState.mode.phase === "uninitialized"
      ? []
      : appState.mode.entries.map((e) => e.id);

  const slideToAdjacent = (id: string, direction: 1 | -1) => {
    const order = entryIds();
    const nextId = order[order.indexOf(id) + direction];
    if (nextId) void animateSettleTo(nextId);
  };

  // Tracking the last id (not just order.length) also catches a reselected
  // historical entry moving to the end, which leaves the length unchanged.
  createEffect((prevLastId: string | null | undefined) => {
    const order = entryIds();
    const lastId = order.length > 0 ? order[order.length - 1] : null;
    const mode = appState.mode;
    // The newest card's own origin says how it got there: appended by the
    // auto loop (slide) vs. placed there by a pick (jump straight to it).
    // Placeholder derivation — see docs/destination-mode.md's non-goal note
    // on the deferred UI pass for a more precise signal.
    const shouldAnimate = mode.phase !== "uninitialized" &&
      mode.entries[mode.entries.length - 1]?.origin === "auto";
    if (prevLastId !== undefined && lastId !== prevLastId && containerRef) {
      const container = containerRef;
      void runSuppressed(() =>
        shouldAnimate
          ? slideToLatest(container, prevLastId ?? null, () => !mounted)
          : Promise.resolve(jumpToLatest(container))
      );
    }
    return lastId;
  }, undefined);

  return (
    <>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // setPointerCapture (for mouse/pen drag above) retargets the click
        // that follows pointerup to this container, not the card underneath
        // — so tap-to-open has to live here rather than on each card's
        // onClick, which would never see it.
        onClick={() => {
          if (didDrag) return;
          setShowList(true);
        }}
        class="w-full flex flex-row gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth cursor-grab select-none active:cursor-grabbing"
      >
        <For each={entryIds()}>
          {(id) => (
            <Show when={appState.destinations[id]}>
              {(ds) => (
                <div
                  data-destination-id={id}
                  class="relative w-full shrink-0 snap-center cursor-pointer"
                  role="button"
                  aria-label="Select exit node"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.repeat) setShowList(true);
                    if (e.key === " ") e.preventDefault();
                    if (e.key === "ArrowRight") {
                      e.preventDefault();
                      slideToAdjacent(id, 1);
                    }
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      slideToAdjacent(id, -1);
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === " ") setShowList(true);
                  }}
                >
                  <LocationBannerCard
                    destinationState={ds()}
                    switchEndsAt={id === currentDisplayId(appState.mode) &&
                        appState.mode.phase === "auto"
                      ? appState.mode.pending?.countdownEndsAt ?? null
                      : null}
                  />
                </div>
              )}
            </Show>
          )}
        </For>
      </div>

      <Portal>
        <Show when={showList()}>
          <ExitNodeList onClose={() => setShowList(false)} />
        </Show>
      </Portal>
    </>
  );
}
