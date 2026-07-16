import { createSignal, onCleanup } from "solid-js";
import { Modal } from "./Modal.tsx";
import copyIcon from "@assets/icons/copy.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";

// Linux update commands, matching the official installer repo
// (https://github.com/gnosis/gnosis_vpn). Kept as a single copyable block
// (no `$` prompts) so the clipboard contents paste-and-run cleanly.
const UPDATE_COMMAND = `sudo apt-get update
sudo apt-get install -y gnosisvpn`;

export default function HowToUpdateModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(copyTimeout));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(UPDATE_COMMAND);
      setCopied(true);
      clearTimeout(copyTimeout);
      copyTimeout = globalThis.setTimeout(() => {
        setCopied(false);
        copyTimeout = undefined;
      }, 1500);
    } catch {
      // Clipboard can be unavailable (e.g. denied permissions); the commands
      // are still visible for manual copy, so silently ignore.
    }
  };

  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div class="flex flex-col gap-4">
        <div class="text-base font-semibold text-text-primary">
          How to update
        </div>
        <div class="text-sm text-text-secondary">
          Run the following in a terminal to update Gnosis VPN on Linux.
        </div>
        <div class="relative rounded-lg border border-border bg-[#12161c] overflow-hidden">
          <button
            type="button"
            onClick={copy}
            aria-label={copied() ? "Copied" : "Copy commands"}
            class="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/20 hover:cursor-pointer transition-colors"
          >
            <img
              src={copied() ? checkmarkIcon : copyIcon}
              width={14}
              height={14}
              alt=""
              class="invert"
            />
            {copied() ? "Copied" : "Copy"}
          </button>
          <pre class="overflow-x-auto px-3 py-3 pr-20 text-xs leading-relaxed font-mono text-gray-100">
            <code>{UPDATE_COMMAND}</code>
          </pre>
        </div>
        <button
          type="button"
          class="h-10 px-4 text-sm rounded-lg font-bold border border-border bg-transparent text-text-primary hover:bg-darken hover:cursor-pointer transition-colors"
          onClick={props.onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
