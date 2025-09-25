import { createSignal } from "solid-js";

export default function IconButton(props: { icon: string; alt: string; onClick: () => void }) {
  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  const playPressAnimation = () => {
    if (pressTimeout !== undefined) globalThis.clearTimeout(pressTimeout);
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = globalThis.setTimeout(() => setPressed(false), 160);
    });
  };

  return (
    <button
      class="p-2 rounded-2xl bg-black hover:cursor-pointer w-10 h-10 flex items-center justify-center transition-transform duration-150 ease-out select-none"
      classList={{ "btn-press": pressed() }}
      onPointerDown={() => playPressAnimation()}
      onClick={props.onClick}
      type="button"
    >
      <img
        src={props.icon}
        alt={props.alt}
        class="w-5 h-5"
      />
    </button>
  );
}
