import { createUniqueId, Show } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { logWarn } from "@src/utils/appLog.ts";
import appConfig from "../../app.config.json";
import { Modal } from "./common/Modal.tsx";
import CopyBlock from "./common/CopyBlock.tsx";

const uploaderUrl = appConfig.logUploaderWebsiteUrl;

export default function ExportLogsModal(props: {
  path: string | null;
  onClose: () => void;
}) {
  const titleId = createUniqueId();

  const openUploader = async (e: MouseEvent) => {
    e.preventDefault();
    try {
      await openUrl(uploaderUrl);
    } catch (err) {
      // The URL stays on screen for manual entry, so this is not a UI error.
      logWarn(`Failed to open log uploader website: ${err}`);
    }
  };

  return (
    <Modal
      open={props.path !== null}
      onClose={props.onClose}
      ariaLabelledBy={titleId}
    >
      <Show when={props.path}>
        {(path) => (
          <div class="flex flex-col gap-4">
            <div id={titleId} class="text-base font-semibold text-text-primary">
              Logs saved
            </div>
            <div class="text-sm text-text-secondary">
              Your logs were saved to:
            </div>
            <CopyBlock text={path()} label="log file path" />
            <div class="flex flex-col gap-1 text-sm text-text-secondary">
              You can upload this file to the Gnosis VPN team at:
              <a
                href={uploaderUrl}
                onClick={openUploader}
                class="self-start font-mono break-all text-orange-500 hover:text-orange-600 underline hover:cursor-pointer"
              >
                {uploaderUrl}
              </a>
            </div>
            <button
              type="button"
              class="h-10 px-4 text-sm rounded-lg font-bold border border-border bg-transparent text-text-primary hover:bg-darken hover:cursor-pointer transition-colors"
              onClick={props.onClose}
            >
              Close
            </button>
          </div>
        )}
      </Show>
    </Modal>
  );
}
