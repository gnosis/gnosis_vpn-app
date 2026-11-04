import { createSignal, onCleanup } from "solid-js";

export default function IconButton(props: {
  icon: string;
  alt: string;
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
      class="p-2 rounded-2xl bg-accent hover:bg-accent-hover hover:cursor-pointer w-10 h-10 flex items-center justify-center transition-transform duration-150 ease-out select-none"
      classList={{
        "btn-press": pressed(),
        "ring-1 ring-inset ring-traffic-gt": props.active,
      }}
      aria-pressed={props.active}
      onPointerDown={() => playPressAnimation()}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      type="button"
    >
      <img src={props.icon} alt={props.alt} class="w-5 h-5" />
    </button>
  );
}
