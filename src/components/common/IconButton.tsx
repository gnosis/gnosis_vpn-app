import { createSignal } from "solid-js";

export default function IconButton(props: { icon: string; alt: string; onClick: () => void }) {
  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: number | undefined;
  const playPressAnimation = () => {
    if (pressTimeout !== undefined) window.clearTimeout(pressTimeout);
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = window.setTimeout(() => setPressed(false), 160);
    });
  };

  return (
    <button
      class="p-2 rounded-2xl bg-black hover:cursor-pointer w-10 h-10 flex items-center 
        justify-center transition-transform duration-150 ease-out select-none"
      classList={{ "btn-press": pressed() }}
      onPointerDown={() => playPressAnimation()}
      onClick={props.onClick}
    >
      <img src={props.icon} alt={props.alt} class="w-5 h-5" />
    </button>
  );
}
