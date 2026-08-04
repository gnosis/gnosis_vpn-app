import { createEffect, For, Show } from "solid-js";
import { useAppStore } from "@src/stores/appStore.ts";
import { useBannerStore } from "@src/stores/bannerStore.ts";
import LocationBannerCard from "./LocationBannerCard.tsx";
import CountdownBadge from "./CountdownBadge.tsx";

// A scrollTo/scrollIntoView call fires the same native scroll events a user
// swipe does. Ignore scroll events for this long after we trigger one
// ourselves — long enough to outlast the smooth-scroll animation — so it
// isn't misread as the user manually scrolling away from the latest card.
const PROGRAMMATIC_SCROLL_WINDOW_MS = 400;
const LATEST_SNAP_EPSILON_PX = 8;

export default function LocationBanner() {
  const [appState] = useAppStore();
  const [bannerState, bannerActions] = useBannerStore();

  let containerRef: HTMLDivElement | undefined;
  let programmaticScrollUntil = 0;
  const cardRefs = new Map<string, HTMLDivElement>();

  const scrollToCard = (id: string) => {
    programmaticScrollUntil = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
    cardRefs.get(id)?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  };

  // A newly-appended card slides into view via native smooth-scroll — no
  // hand-rolled translateX animation needed, and it reuses the same
  // interaction the user swipes with.
  createEffect((prevLength: number | undefined) => {
    const length = bannerState.order.length;
    if (prevLength !== undefined && length > prevLength && containerRef) {
      programmaticScrollUntil = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
      containerRef.scrollTo({
        left: containerRef.scrollWidth,
        behavior: "smooth",
      });
    }
    return length;
  }, undefined);

  const handleScroll = () => {
    if (!containerRef) return;
    if (Date.now() < programmaticScrollUntil) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef;
    const atLatest = Math.abs(scrollLeft - (scrollWidth - clientWidth)) <
      LATEST_SNAP_EPSILON_PX;
    bannerActions.noteViewingLatest(atLatest);
  };

  const handleSelect = (id: string) => {
    bannerActions.setActiveId(id, { manual: true });
    scrollToCard(id);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      class="flex-1 min-w-0 flex flex-row gap-2 overflow-x-auto snap-x snap-mandatory scroll-smooth"
    >
      <For each={bannerState.order}>
        {(id) => (
          <Show when={appState.destinations[id]}>
            {(ds) => (
              <div
                ref={(el) => cardRefs.set(id, el)}
                class="relative w-full shrink-0 snap-center cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.repeat) handleSelect(id);
                  if (e.key === " ") e.preventDefault();
                }}
                onKeyUp={(e) => {
                  if (e.key === " ") handleSelect(id);
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
  );
}
