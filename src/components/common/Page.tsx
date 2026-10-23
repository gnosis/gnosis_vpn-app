import { type JSX, onCleanup, onMount } from "solid-js";

/**
 * A page inside the main window: back button, title, scrolling body. The
 * slide-in is CSS (`page-enter`); MainScreen keys pages by id so each mount
 * plays it. Esc, Cmd+[ and Alt+Left go back unless a modal is open.
 */
export default function Page(props: {
  title: string;
  onBack: () => void;
  children: JSX.Element;
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    // A modal or an open popup button owns Esc first.
    if (
      document.querySelector('[role="dialog"][aria-modal="true"]') ||
      document.querySelector('[aria-haspopup="listbox"][aria-expanded="true"]')
    ) return;
    const backChord = (e.key === "[" && (e.metaKey || e.ctrlKey)) ||
      (e.key === "ArrowLeft" && e.altKey);
    if (e.key === "Escape" || backChord) {
      e.preventDefault();
      e.stopPropagation();
      props.onBack();
    }
  };
  // Capture: the main screen's own Esc handling (cancel a connect) must not see it.
  onMount(() => document.addEventListener("keydown", onKeyDown, true));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown, true));

  return (
    <div class="page-enter flex h-full w-full flex-col bg-bg-primary">
      <header class="flex shrink-0 items-center gap-3 px-4 pb-3 pt-6">
        <button
          type="button"
          aria-label="Back"
          class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-surface text-text-primary transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => props.onBack()}
        >
          <svg
            viewBox="0 0 8 12"
            class="size-3"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6.5 1.5L2 6l4.5 4.5" />
          </svg>
        </button>
        <h1 class="truncate text-xl font-bold text-text-primary">
          {props.title}
        </h1>
      </header>
      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6">
        {props.children}
      </div>
    </div>
  );
}
