import { createEffect, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import { currentDisplayId } from "@src/stores/destinationMode.ts";
import LocationBannerCard from "./LocationBannerCard.tsx";
import ExitNodeList from "./ExitNodeList.tsx";

// Must match .banner-card-pulse's animation-duration in index.css — the
// outgoing card shrinks then grows back before the slide starts.
const CARD_PULSE_MS = 600;
// Slower than a native smooth-scroll so the motion reads as a deliberate
// slide rather than a jump.
const SLIDE_MS = 1500;
// A scrollLeft change fires the same native scroll events a user swipe
// does. Ignore scroll events for this long after we drive one ourselves —
// long enough to outlast the pulse-then-slide sequence plus a small
// settling margin — so it isn't misread as the user manually scrolling away
// from the latest card.
const PROGRAMMATIC_SCROLL_WINDOW_MS = CARD_PULSE_MS + SLIDE_MS + 50;
// A jump has no animation to outlast — just enough margin for the resulting
// scroll event to land.
const JUMP_SCROLL_WINDOW_MS = 50;
const LATEST_SNAP_EPSILON_PX = 8;
const DRAG_THRESHOLD_PX = 6;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateScrollLeft(
  el: HTMLElement,
  to: number,
  duration: number,
): Promise<void> {
  const from = el.scrollLeft;
  const delta = to - from;
  if (delta === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
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

  container.style.scrollBehavior = "auto";
  container.style.scrollSnapType = "none";
  // The browser clamps scrollLeft writes to scrollWidth - clientWidth, not
  // scrollWidth itself — animating toward the unclamped value would have
  // our eased progress hit that ceiling (and visually stop) well before
  // SLIDE_MS has actually elapsed.
  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  await animateScrollLeft(container, maxScrollLeft, SLIDE_MS);
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

export default function LocationBanner() {
  const [appState, appActions] = useAppStore();
  const [showList, setShowList] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;
  let programmaticScrollUntil = 0;

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

  // Settles on whichever card ends up most centered once free-dragging
  // hands back control to CSS scroll-snap.
  const settleToNearestCard = () => {
    if (!containerRef) return;
    const containerCenter = containerRef.getBoundingClientRect().left +
      containerRef.clientWidth / 2;
    let nearestCard: Element | undefined;
    let nearestDistance = Infinity;
    for (const card of containerRef.children) {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - containerCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCard = card;
      }
    }
    nearestCard?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
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

  // Tracking the last id (not just order.length) also catches a reselected
  // historical entry moving to the end, which leaves the length unchanged.
  createEffect((prevLastId: string | null | undefined) => {
    const order = appState.destinationOrder;
    const lastId = order.length > 0 ? order[order.length - 1] : null;
    const shouldAnimate = appState.switchAnimate;
    if (prevLastId !== undefined && lastId !== prevLastId && containerRef) {
      if (shouldAnimate) {
        programmaticScrollUntil = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
        void slideToLatest(containerRef, prevLastId ?? null);
      } else {
        programmaticScrollUntil = Date.now() + JUMP_SCROLL_WINDOW_MS;
        jumpToLatest(containerRef);
      }
    }
    return lastId;
  }, undefined);

  const handleScroll = () => {
    if (!containerRef) return;
    if (Date.now() < programmaticScrollUntil) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef;
    const atLatest = Math.abs(scrollLeft - (scrollWidth - clientWidth)) <
      LATEST_SNAP_EPSILON_PX;
    appActions.noteViewingLatest(atLatest);
  };

  return (
    <>
      <div
        ref={containerRef}
        onScroll={handleScroll}
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
        <For each={appState.destinationOrder}>
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
                  }}
                  onKeyUp={(e) => {
                    if (e.key === " ") setShowList(true);
                  }}
                >
                  <LocationBannerCard
                    destinationState={ds()}
                    switchEndsAt={id === currentDisplayId(appState.mode) &&
                        appState.mode.kind === "auto"
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
