import {
  createResource,
  createSignal,
  Match,
  onCleanup,
  Switch,
} from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { logWarn } from "@src/utils/appLog.ts";
import { getPlatform } from "@src/utils/platform.ts";
import { Modal } from "./Modal.tsx";
import copyIcon from "@assets/icons/copy.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";

// Linux update commands, matching the official installer repo
// (https://github.com/gnosis/gnosis_vpn). Kept as a single copyable block
// (no `$` prompts) so the clipboard contents paste-and-run cleanly.
const UPDATE_COMMAND = `sudo apt-get update
sudo apt-get install -y gnosisvpn`;

// macOS has no package-manager path: the installer pkg is the whole update, and
// it is also the way back from a missing or too-old toolkit binary.
const DOWNLOADS_URL = "https://downloads.vpn.gnosis.eth.limo/";

export default function HowToUpdateModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = createSignal(false);
  // The apt commands cannot update a macOS install, so the platform decides
  // what this modal says; getPlatform() caches, so this resolves once.
  const [platform] = createResource(getPlatform);
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
    } catch (e) {
      // Clipboard can be unavailable (e.g. denied permissions); the commands
      // are still visible for manual copy, so no UI error.
      logWarn(`Failed to copy update command: ${e}`);
    }
  };

  const openDownloads = async () => {
    try {
      await openUrl(DOWNLOADS_URL);
    } catch (e) {
      // The URL stays on screen for manual entry, so this is not a UI error.
      logWarn(`Failed to open downloads page: ${e}`);
    }
  };

  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div class="flex flex-col gap-4">
        <div class="text-base font-semibold text-text-primary">
          How to update
        </div>
        <Switch
          fallback={
            <>
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
            </>
          }
        >
          <Match when={platform.loading}>
            <div class="text-sm text-text-secondary">
              Checking which instructions apply…
            </div>
          </Match>
          <Match when={platform() === "macos"}>
            <div class="text-sm text-text-secondary">
              Download the latest{" "}
              <span class="font-mono">GnosisVPN-Installer.pkg</span>{" "}
              and double-click it to update Gnosis VPN on macOS.
            </div>
            <button
              type="button"
              onClick={openDownloads}
              class="h-10 px-4 text-sm rounded-lg font-bold border border-border bg-transparent text-text-primary hover:bg-darken hover:cursor-pointer transition-colors"
            >
              Open the downloads page
            </button>
            <div class="text-xs text-text-secondary break-all font-mono">
              {DOWNLOADS_URL}
            </div>
          </Match>
        </Switch>
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
