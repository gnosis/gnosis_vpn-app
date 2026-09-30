import { createResource, Match, Switch } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { logWarn } from "@src/utils/appLog.ts";
import { getPlatform } from "@src/utils/platform.ts";
import { Modal } from "./Modal.tsx";
import CopyBlock from "./CopyBlock.tsx";

// Linux update commands, matching the official installer repo
// (https://github.com/gnosis/gnosis_vpn). Kept as a single copyable block
// (no `$` prompts) so the clipboard contents paste-and-run cleanly.
const UPDATE_COMMAND = `sudo apt-get update
sudo apt-get install -y gnosisvpn`;

// macOS has no package-manager path: the installer pkg is the whole update, and
// it is also the way back from a missing or too-old toolkit binary.
const DOWNLOADS_URL = "https://downloads.vpn.gnosis.eth.limo/";

function DownloadsButton(props: { label: string; onOpen: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={props.onOpen}
        class="h-10 px-4 text-sm rounded-lg font-bold border border-border bg-transparent text-text-primary hover:bg-darken hover:cursor-pointer transition-colors"
      >
        {props.label}
      </button>
      <div class="text-xs text-text-secondary break-all font-mono">
        {DOWNLOADS_URL}
      </div>
    </>
  );
}

export default function HowToUpdateModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  // The apt commands cannot update a macOS install, so the platform decides
  // what this modal says; getPlatform() caches, so this resolves once.
  const [platform, { refetch: refetchPlatform }] = createResource(getPlatform);

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
        {/* Only an explicit "linux" gets apt: guessing hands the user the wrong OS. */}
        <Switch
          fallback={
            <>
              <div class="text-sm text-text-secondary">
                We couldn't tell which platform this is, so both routes are
                below.
              </div>
              <div class="text-sm text-text-secondary">
                On macOS, download the latest{" "}
                <span class="font-mono">GnosisVPN-Installer.pkg</span>{" "}
                and double-click it.
              </div>
              <DownloadsButton
                label="Open the downloads page"
                onOpen={openDownloads}
              />
              <div class="text-sm text-text-secondary">
                On Linux, run the following in a terminal.
              </div>
              <CopyBlock text={UPDATE_COMMAND} label="update commands" />
              <button
                type="button"
                onClick={() => void refetchPlatform()}
                class="h-10 px-4 text-sm rounded-lg border border-border bg-transparent text-text-secondary hover:bg-darken hover:cursor-pointer transition-colors"
              >
                Detect my platform again
              </button>
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
            <DownloadsButton
              label="Open the downloads page"
              onOpen={openDownloads}
            />
          </Match>
          <Match when={platform() === "linux"}>
            <div class="text-sm text-text-secondary">
              Run the following in a terminal to update Gnosis VPN on Linux.
            </div>
            <CopyBlock text={UPDATE_COMMAND} label="update commands" />
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
