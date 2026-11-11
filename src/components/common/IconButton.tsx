import { createSignal, type JSX, onCleanup, Show } from "solid-js";

export default function IconButton(props: {
  label: string;
  children: JSX.Element;
  /** Violet dot in the top-right corner. */
  badge?: boolean;
  /** Pressed look for a button that toggles a view. */
  active?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  ref?: (el: HTMLButtonElement) => void;
}) {
  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  onCleanup(() => {
    globalThis.clearTimeout(pressTimeout);
  });

  const playPressAnimation = () => {
    globalThis.clearTimeout(pressTimeout);
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = globalThis.setTimeout(() => setPressed(false), 160);
    });
  };

  return (
    <button
      ref={props.ref}
      class="relative rounded-lg bg-control-bg hover:bg-control-bg-hover text-text-primary hover:cursor-pointer h-7.5 min-w-7.5 px-1.75 flex items-center justify-center transition-transform duration-150 ease-out select-none"
      classList={{
        "btn-press": pressed(),
        "ring-1 ring-inset ring-traffic-gt": props.active,
      }}
      aria-pressed={props.active}
      onPointerDown={() => playPressAnimation()}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      aria-label={props.label}
      type="button"
    >
      {props.children}
      <Show when={props.badge}>
        <span class="absolute top-1 right-1 size-1.75 rounded-full bg-update-dot" />
      </Show>
    </button>
  );
}
