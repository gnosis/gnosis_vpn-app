import { JSX, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  warn?: boolean;
  children: JSX.Element;
};

export function Modal(props: ModalProps) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };

  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
          onClick={() => props.onClose()}
          aria-hidden="true"
        />

        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            class={`w-full max-w-md rounded-lg shadow-xl ring-1 ring-black/10 ${
              props.warn ? "bg-[#FFCDCD]" : "bg-[#E2F5FF]"
            }`}
          >
            <div class="px-5 py-4">{props.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
