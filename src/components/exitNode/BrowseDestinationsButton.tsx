import { createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import ExitNodeList from "./ExitNodeList.tsx";

// The banner only ever shows destinations the auto-selection logic has
// surfaced, so this stays as the way to reach any other known destination.
export default function BrowseDestinationsButton() {
  const [showList, setShowList] = createSignal(false);

  return (
    <>
      <button
        type="button"
        aria-label="Browse exit nodes"
        class="flex h-16 w-12 shrink-0 items-center justify-center rounded-2xl bg-bg-surface hover:bg-bg-surface-alt transition-colors"
        onClick={() => setShowList(true)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-4 w-4 text-text-secondary"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      <Portal>
        <Show when={showList()}>
          <ExitNodeList onClose={() => setShowList(false)} />
        </Show>
      </Portal>
    </>
  );
}
