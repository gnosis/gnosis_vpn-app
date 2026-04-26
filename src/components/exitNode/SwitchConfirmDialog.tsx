import { onMount } from "solid-js";
import type { Destination } from "@src/services/vpnService.ts";
import { destinationLabel } from "@src/utils/destinations.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import switchIcon from "@assets/icons/switch.svg";
import Button from "../common/Button.tsx";
import Toggle from "../common/Toggle.tsx";

export default function SwitchConfirmDialog(props: {
  destination: Destination;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [settings, settingsActions] = useSettingsStore();

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
      onClick={() => props.onCancel()}
    >
      {
        /*
         * Escape dismissal is handled by the parent (ExitNodeList) via a
         * document-level keydown listener. This component handles Tab trapping only.
         */
      }
      <div
        ref={dialogRef}
        tabIndex={-1}
        class="w-full max-w-sm bg-bg-surface rounded-lg shadow-xl ring-1 ring-black/10 px-5 py-4 outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title-switch"
        aria-describedby="dialog-desc-switch"
      >
        <h2 id="dialog-title-switch" class="sr-only">Switch Exit Node</h2>
        <div class="flex items-start gap-3 mb-4">
          <img
            src={switchIcon}
            alt=""
            class="w-8 h-8 shrink-0"
            aria-hidden="true"
          />
          <p id="dialog-desc-switch" class="text-text-primary text-sm">
            You're about to switch Exit Node to:
            <strong class="block font-semibold">
              {destinationLabel(props.destination)}
            </strong>
          </p>
        </div>

        <div class="mb-4">
          <Toggle
            label="Don't ask again when switching"
            checked={settings.skipSwitchConfirmation}
            onChange={(e) =>
              void settingsActions.setSkipSwitchConfirmation(
                e.currentTarget.checked,
              )}
          />
        </div>

        <div class="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            fullWidth={false}
            class="flex-1"
            onClick={() => props.onConfirm()}
          >
            Switch
          </Button>
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            class="flex-1"
            onClick={() => props.onCancel()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
