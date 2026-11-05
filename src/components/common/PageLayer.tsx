import { type JSX, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";

/** A full-window page: what was on screen before it stays inert under it, and focus goes back there on close. */
export default function PageLayer(
  props: { label: string; children: JSX.Element },
) {
  let layer: HTMLDivElement | undefined;
  let page: HTMLElement | undefined;
  const opener = document.activeElement;
  const covered: HTMLElement[] = [];

  onMount(() => {
    for (const el of document.body.children) {
      if (el === layer) break;
      // a dialog already open stays usable above the page
      if (
        el instanceof HTMLElement && !el.inert &&
        !el.querySelector('[aria-modal="true"]')
      ) {
        el.inert = true;
        covered.push(el);
      }
    }
    page?.focus({ preventScroll: true });
  });

  onCleanup(() => {
    for (const el of covered) el.inert = false;
    if (opener instanceof HTMLElement && opener.isConnected) {
      opener.focus({ preventScroll: true });
    }
  });

  return (
    <Portal ref={(el) => (layer = el)}>
      <section
        ref={page}
        aria-label={props.label}
        tabindex="-1"
        class="fixed inset-0 z-100 flex flex-col bg-bg-primary text-text-primary outline-none page-slide-in"
      >
        {props.children}
      </section>
    </Portal>
  );
}
