import type { JSX } from "solid-js";

export function SettingsHeading(props: { children: JSX.Element }) {
  return (
    <h2 class="mx-1 mt-3 text-xs leading-4 text-text-subtle">
      {props.children}
    </h2>
  );
}

/** One card of settings rows. */
export function SettingsCard(props: { label?: string; children: JSX.Element }) {
  return (
    <div
      role="group"
      aria-label={props.label}
      class="flex shrink-0 flex-col rounded-xl bg-bg-list"
    >
      {props.children}
    </div>
  );
}
