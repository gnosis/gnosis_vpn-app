import { createSignal, type JSX, Show } from "solid-js";

export default function Tooltip(
  props: {
    content: JSX.Element;
    children: JSX.Element;
    position?: "top" | "bottom";
  },
) {
  const [visible, setVisible] = createSignal(false);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const show = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => setVisible(true), 120);
  };

  const hide = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => setVisible(false), 100);
  };

  const pos = () => props.position ?? "top";

  return (
    <div
      class="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusIn={show}
      onFocusOut={hide}
    >
      {props.children}
      <Show when={visible()}>
        <div
          class={`tooltip-bubble absolute left-1/2 z-50 w-max max-w-52
            rounded-lg bg-black/80 backdrop-blur-sm px-3 py-2 shadow-lg
            text-xs leading-relaxed text-gray-100
            ${pos() === "top" ? "bottom-full mb-2" : "top-full mt-2"}
          `}
          style={{ transform: "translateX(-50%)" }}
        >
          {props.content}
          <span
            class={`absolute left-1/2 -translate-x-1/2 size-2 rotate-45
              bg-black/80
              ${pos() === "top" ? "top-full -mt-1" : "bottom-full -mb-1"}
            `}
          />
        </div>
      </Show>
    </div>
  );
}
