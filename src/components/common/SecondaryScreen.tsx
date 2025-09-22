import { children, JSX, onMount } from "solid-js";
import { useAppStore } from "../../stores/appStore";

export function SecondaryScreen({
  children: innerComponent,
}: {
  children: JSX.Element;
}) {
  const [appState, appActions] = useAppStore();

  const c = children(() => innerComponent);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      appActions.setScreen("main");
    }
  }

  let containerRef: HTMLDivElement | undefined;
  onMount(() => {
    containerRef?.focus();
  });

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      class="h-full w-full z-20"
      on:keydown={handleKeyDown}
    >
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h1 class="text-gray-600 dark:text-gray-400 capitalize text-lg">
          {appState.currentScreen}
        </h1>
        <button
          type="button"
          class="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close"
          onClick={() => appActions.setScreen("main")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="h-5 w-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      {c()}
    </div>
  );
}
