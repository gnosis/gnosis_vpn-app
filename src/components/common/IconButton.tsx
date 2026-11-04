import { createSignal, type JSX, onCleanup } from "solid-js";

export default function IconButton(props: {
  label: string;
  children: JSX.Element;
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
      class="rounded-lg bg-control-bg hover:bg-control-bg-hover text-text-primary hover:cursor-pointer h-7.5 min-w-7.5 px-1.75 flex items-center justify-center transition-transform duration-150 ease-out select-none"
      classList={{ "btn-press": pressed() }}
      onPointerDown={() => playPressAnimation()}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      aria-label={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}
