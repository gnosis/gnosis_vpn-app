import { createEffect, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useAppStore } from "@src/stores/appStore.ts";
import { useBannerStore } from "@src/stores/bannerStore.ts";
import LocationBannerCard from "./LocationBannerCard.tsx";
import CountdownBadge from "./CountdownBadge.tsx";
import ExitNodeList from "./ExitNodeList.tsx";

// A scrollTo call fires the same native scroll events a user swipe does.
// Ignore scroll events for this long after we trigger one ourselves — long
// enough to outlast the smooth-scroll animation — so it isn't misread as the
// user manually scrolling away from the latest card.
const PROGRAMMATIC_SCROLL_WINDOW_MS = 400;
const LATEST_SNAP_EPSILON_PX = 8;

export default function LocationBanner() {
  const [appState] = useAppStore();
  const [bannerState, bannerActions] = useBannerStore();
  const [showList, setShowList] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;
  let programmaticScrollUntil = 0;

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
        class="w-full flex flex-row gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth"
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
                  onClick={() => setShowList(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.repeat) setShowList(true);
                    if (e.key === " ") e.preventDefault();
                  }}
                  onKeyUp={(e) => {
                    if (e.key === " ") setShowList(true);
                  }}
                >
                  <LocationBannerCard destinationState={ds()} />
                  <Show
                    when={id === bannerState.activeId
                      ? bannerState.countdownEndsAt
                      : null}
                  >
                    {(endsAt) => <CountdownBadge countdownEndsAt={endsAt()} />}
                  </Show>
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
