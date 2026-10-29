import { type JSX, Show } from "solid-js";

/** A small-caps section header and its inset card of rows. */
export function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-1.5">
      <h2 class="px-1 text-[11px] font-bold uppercase tracking-wide text-text-secondary">
        {props.title}
      </h2>
      <div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-surface">
        {props.children}
      </div>
    </section>
  );
}

/**
 * One ~40 px row: an optional icon, a label (with an optional second line),
 * and whatever control sits on the right. With `onClick` the whole row is a
 * button and ends in a chevron.
 */
export function Row(props: {
  label: JSX.Element;
  description?: JSX.Element;
  icon?: JSX.Element;
  control?: JSX.Element;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const content = (
    <>
      <Show when={props.icon}>
        <span class="flex size-5 shrink-0 items-center justify-center text-text-primary [&_svg]:size-5">
          {props.icon}
        </span>
      </Show>
      <span class="flex min-w-0 flex-1 flex-col text-left">
        <span class="truncate text-sm text-text-primary">{props.label}</span>
        <Show when={props.description}>
          <span class="text-xs text-text-secondary">{props.description}</span>
        </Show>
      </span>
      <Show when={props.control}>
        <span class="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary">
          {props.control}
        </span>
      </Show>
    </>
  );

  return (
    <Show
      when={props.onClick}
      fallback={
        <div class="flex min-h-10 items-center gap-3 px-3 py-1.5">
          {content}
        </div>
      }
    >
      <button
        type="button"
        aria-label={props.ariaLabel}
        class="flex min-h-10 w-full items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        onClick={() => props.onClick?.()}
      >
        {content}
        <svg
          viewBox="0 0 8 12"
          class="size-3 shrink-0 text-text-muted"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M1.5 1.5L6 6l-4.5 4.5" />
        </svg>
      </button>
    </Show>
  );
}
