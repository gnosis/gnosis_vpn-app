import { For, Show } from "solid-js";
import { useAppStore } from "@src/stores/appStore.ts";
import { useBannerStore } from "@src/stores/bannerStore.ts";
import LocationBannerCard from "./LocationBannerCard.tsx";

export default function LocationBanner() {
  const [appState] = useAppStore();
  const [bannerState] = useBannerStore();

  return (
    <div class="w-full flex flex-row gap-2">
      <For each={bannerState.order}>
        {(id) => (
          <Show when={appState.destinations[id]}>
            {(ds) => <LocationBannerCard destinationState={ds()} />}
          </Show>
        )}
      </For>
    </div>
  );
}
