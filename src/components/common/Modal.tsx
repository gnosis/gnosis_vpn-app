import { type JSX, Show, onCleanup, onMount } from 'solid-js';

export interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: JSX.Element;
}

export default function Modal(props: ModalProps) {
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };

  onMount(() => {
    window.addEventListener('keydown', handleKey);
  });
  onCleanup(() => window.removeEventListener('keydown', handleKey));

  const stop = (e: Event) => e.stopPropagation();

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50"
        role="dialog"
        aria-modal="true"
        onClick={props.onClose}
      >
        <div class="absolute inset-0 bg-black/50" aria-hidden="true"></div>
        <div
          class="relative z-10 w-full h-full bg-white dark:bg-gray-900 flex flex-col"
          onClick={stop}
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h3 class="text-lg font-semibold">{props.title}</h3>
            <button
              type="button"
              class="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close"
              onClick={props.onClose}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="h-5 w-5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div class="p-4 flex-1 overflow-auto">{props.children}</div>
        </div>
      </div>
    </Show>
  );
}
