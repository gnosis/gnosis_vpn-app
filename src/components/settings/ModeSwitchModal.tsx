import { createUniqueId } from "solid-js";
import { Modal } from "../common/Modal.tsx";

const outlineButtonClass =
  "grow h-10 px-4 text-sm rounded-lg font-bold border border-border bg-transparent text-text-primary hover:bg-darken hover:cursor-pointer transition-colors";

const primaryButtonClass =
  "grow h-10 px-4 text-sm rounded-lg font-bold border border-transparent bg-accent text-accent-text hover:bg-accent-hover hover:cursor-pointer transition-colors";

/** Asks before a mode switch ends the running connection. */
export default function ModeSwitchModal(props: {
  // the mode being switched to; null keeps the modal closed
  bootstrap: boolean | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = createUniqueId();
  const modeName = () => props.bootstrap ? "bootstrap mode" : "normal mode";

  return (
    <Modal
      open={props.bootstrap !== null}
      onClose={() => props.onClose()}
      ariaLabelledBy={titleId}
    >
      <div class="flex flex-col gap-3">
        <div id={titleId} class="text-base font-semibold text-text-primary">
          Switch to {modeName()}?
        </div>
        <div class="text-[13px]/[18px] text-text-secondary">
          This ends your current VPN connection. Gnosis VPN then reconnects
          through the best exit of {modeName()}.
        </div>
        <div class="flex gap-2 pt-1">
          <button
            type="button"
            class={outlineButtonClass}
            onClick={() => props.onClose()}
          >
            Cancel
          </button>
          <button
            type="button"
            class={primaryButtonClass}
            onClick={() => props.onConfirm()}
          >
            Switch
          </button>
        </div>
      </div>
    </Modal>
  );
}
