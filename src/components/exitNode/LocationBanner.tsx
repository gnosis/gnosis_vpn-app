import { createEffect, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import { useBannerStore } from "@src/stores/bannerStore.ts";
import LocationBannerCard from "./LocationBannerCard.tsx";
import ExitNodeList from "./ExitNodeList.tsx";

// A scrollTo call fires the same native scroll events a user swipe does.
// Ignore scroll events for this long after we trigger one ourselves — long
// enough to outlast the smooth-scroll animation — so it isn't misread as the
// user manually scrolling away from the latest card.
const PROGRAMMATIC_SCROLL_WINDOW_MS = 400;
const LATEST_SNAP_EPSILON_PX = 8;
const DRAG_THRESHOLD_PX = 6;

export default function LocationBanner() {
  const [appState] = useAppStore();
  const [bannerState, bannerActions] = useBannerStore();
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

  // The newest card slides into view via native smooth-scroll — no
  // hand-rolled translateX animation needed, and it reuses the same
  // interaction the user swipes with. Tracking the last id (not just
  // order.length) also catches a reselected historical entry moving to
  // the end, which leaves the length unchanged.
  createEffect((prevLastId: string | null | undefined) => {
    const order = bannerState.order;
    const lastId = order.length > 0 ? order[order.length - 1] : null;
    if (prevLastId !== undefined && lastId !== prevLastId && containerRef) {
      programmaticScrollUntil = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
      containerRef.scrollTo({
        left: containerRef.scrollWidth,
        behavior: "smooth",
      });
    }
    return lastId;
  }, undefined);

  const handleScroll = () => {
    if (!containerRef) return;
    if (Date.now() < programmaticScrollUntil) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef;
    const atLatest = Math.abs(scrollLeft - (scrollWidth - clientWidth)) <
      LATEST_SNAP_EPSILON_PX;
    bannerActions.noteViewingLatest(atLatest);
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
        <For each={bannerState.order}>
          {(id) => (
            <Show when={appState.destinations[id]}>
              {(ds) => (
                <div
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
                    switchEndsAt={id === bannerState.activeId
                      ? bannerState.countdownEndsAt
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
