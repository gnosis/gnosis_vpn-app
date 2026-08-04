import { createEffect, For, Show } from "solid-js";
import { useAppStore } from "@src/stores/appStore.ts";
import { useBannerStore } from "@src/stores/bannerStore.ts";
import LocationBannerCard from "./LocationBannerCard.tsx";
import CountdownBadge from "./CountdownBadge.tsx";

export default function LocationBanner() {
  const [appState] = useAppStore();
  const [bannerState] = useBannerStore();

  let containerRef: HTMLDivElement | undefined;

  // A newly-appended card slides into view via native smooth-scroll — no
  // hand-rolled translateX animation needed, and it reuses the same
  // interaction the user swipes with.
  createEffect((prevLength: number | undefined) => {
    const length = bannerState.order.length;
    if (prevLength !== undefined && length > prevLength) {
      containerRef?.scrollTo({
        left: containerRef.scrollWidth,
        behavior: "smooth",
      });
    }
    return length;
  }, undefined);

  return (
    <div
      ref={containerRef}
      class="w-full flex flex-row gap-2 overflow-x-auto snap-x snap-mandatory scroll-smooth"
    >
      <For each={bannerState.order}>
        {(id) => (
          <Show when={appState.destinations[id]}>
            {(ds) => (
              <div class="relative w-full shrink-0 snap-center">
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
