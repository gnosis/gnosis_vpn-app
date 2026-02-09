import { children, JSX, onMount } from "solid-js";
import { AppScreen, useAppStore } from "../../stores/appStore.ts";

export function SecondaryScreen(
  { children: innerComponent, title }: {
    children: JSX.Element;
    title?: string;
  },
) {
  const [appState, appActions] = useAppStore();

  const c = children(() => innerComponent);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      appActions.setScreen(AppScreen.Main);
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
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 class="text-text-secondary capitalize text-lg">
          {title ?? appState.currentScreen}
        </h1>
        <button
          type="button"
          class="rounded-md p-1 hover:bg-bg-surface"
          aria-label="Close"
          onClick={() => appActions.setScreen(AppScreen.Main)}
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
