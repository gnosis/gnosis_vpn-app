import { JSX, Show, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
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

        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={props.title ? "modal-title" : undefined}
            class={`w-full max-w-md rounded-2xl shadow-xl ring-1 ring-black/10 ${props.warn ? "bg-[#FFCDCD]" : "bg-[#E2F5FF]"}`}
          >
            <Show when={props.title}>
              <div class="px-5 pt-4 pb-2">
                <h2 id="modal-title" class="text-base font-semibold text-gray-900">
                  {props.title}
                </h2>
              </div>
            </Show>

            <div class="px-5 py-4">{props.children}</div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
