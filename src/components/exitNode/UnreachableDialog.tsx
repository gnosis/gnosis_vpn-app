import { onMount } from "solid-js";
import warningIcon from "@assets/icons/warning.svg";
import Button from "../common/Button.tsx";

export default function UnreachableDialog(props: { onClose: () => void }) {
  let dialogRef: HTMLDivElement | undefined;
  onMount(() => dialogRef?.focus());

  const trapFocus = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const focusable = dialogRef?.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      class="absolute inset-0 bg-bg-overlay backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={() => props.onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        class="w-full max-w-sm bg-bg-surface rounded-lg shadow-xl ring-1 ring-black/10 px-5 py-4 outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title-unreachable"
        aria-describedby="dialog-desc-unreachable"
      >
        <h2 id="dialog-title-unreachable" class="sr-only">
          Node Unreachable
        </h2>
        <div class="flex items-start gap-3 mb-4">
          <img
            src={warningIcon}
            alt=""
            class="w-8 h-8 shrink-0"
            aria-hidden="true"
          />
          <p id="dialog-desc-unreachable" class="text-text-primary text-sm">
            The node is currently unreachable. Please select another Exit Node.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          fullWidth={false}
          onClick={() => props.onClose()}
        >
          Close
        </Button>
      </div>
    </div>
  );
}
