import {
  createEffect,
  createResource,
  createSignal,
  createUniqueId,
  Show,
} from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { VPNService } from "../services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { logWarn } from "@src/utils/appLog.ts";
import { logBundleFileName, logDiscussionUrl } from "@src/utils/logBundle.ts";
import {
  getArch,
  getOsDistribution,
  getPlatform,
} from "@src/utils/platform.ts";
import { Modal } from "./common/Modal.tsx";
import Checkbox from "./common/Checkbox.tsx";
import CopyBlock from "./common/CopyBlock.tsx";

// Mirrors MAX_DESCRIPTION_CHARS in the backend's log bundle.
const MAX_DESCRIPTION_CHARS = 2000;

const outlineButtonClass =
  "grow h-10 px-4 text-sm rounded-lg font-bold border border-border bg-transparent text-text-primary enabled:hover:bg-darken enabled:hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export default function UploadLogsModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  const [appState] = useAppStore();
  // Never rejects: each getter has its own fallback.
  const [system] = createResource(async () => ({
    os: await getPlatform(),
    arch: await getArch(),
    distribution: await getOsDistribution(),
  }));
  const [acknowledged, setAcknowledged] = createSignal(false);
  const [description, setDescription] = createSignal("");
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [referenceId, setReferenceId] = createSignal<string | null>(null);
  const titleId = createUniqueId();

  createEffect(() => {
    if (!props.open) return;
    setAcknowledged(false);
    setDescription("");
    setError(null);
    setReferenceId(null);
  });

  const canUpload = () =>
    acknowledged() && description().trim() !== "" && !uploading();

  // Closing mid-upload would drop the reference ID the user is waiting for.
  const close = () => {
    if (!uploading()) props.onClose();
  };

  async function upload() {
    setUploading(true);
    setError(null);
    try {
      setReferenceId(
        await VPNService.uploadLogs(logBundleFileName(), description()),
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setUploading(false);
    }
  }

  const openDiscussion = async (e: MouseEvent, url: string) => {
    e.preventDefault();
    try {
      await openUrl(url);
    } catch (err) {
      logWarn(`Failed to open GitHub discussion page: ${err}`);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={close}
      ariaLabelledBy={titleId}
      maxWidthClass="max-w-[505px]"
    >
      <Show
        when={referenceId()}
        fallback={
          <div class="flex flex-col gap-3">
            <div id={titleId} class="text-base font-semibold text-text-primary">
              Upload logs
            </div>
            <div class="text-[13px]/[18px] text-text-secondary">
              Uploading your logs helps us diagnose problems. Before you
              continue, be aware that logs can contain information that
              identifies you or your device, including:
            </div>
            <ul class="list-disc pl-5 text-[13px]/[18px] text-text-secondary">
              <li>Your username, which may appear in file paths</li>
              <li>Your public IP address</li>
              <li>
                Details about your system, such as OS version, performance and
                disk space
              </li>
            </ul>
            <div class="text-[13px]/[18px] text-text-secondary">
              If you'd rather review or redact the logs first, use Export logs
              instead and share them manually. Logs are deleted after 30 days.
            </div>
            <label class="flex flex-col gap-1 text-sm text-text-primary">
              <span>
                What went wrong? <span class="text-red-600">(* required)</span>
              </span>
              <textarea
                rows={3}
                required
                maxLength={MAX_DESCRIPTION_CHARS}
                placeholder="Describe the issue and why you are sharing your logs"
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                disabled={uploading()}
                class="w-full resize-none rounded-lg border border-border bg-bg-surface-alt px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-1 focus:ring-text-secondary"
              />
            </label>
            <label class="flex items-start gap-2 text-[13px]/[18px] text-text-primary hover:cursor-pointer">
              <Checkbox
                checked={acknowledged()}
                onChange={setAcknowledged}
                disabled={uploading()}
                title="Acknowledge the personal data notice"
                class="shrink-0 hover:cursor-pointer"
              />
              I understand my logs may contain personal data and agree to share
              them with the Gnosis VPN team.
            </label>
            <Show when={error()}>
              <div class="text-xs text-red-600 break-words">{error()}</div>
            </Show>
            <div class="flex flex-row gap-2">
              <button
                type="button"
                class={outlineButtonClass}
                disabled={uploading()}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="button"
                class="grow h-10 px-4 text-sm rounded-lg font-bold border border-transparent bg-accent text-accent-text enabled:hover:bg-accent-hover enabled:hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={!canUpload()}
                onClick={upload}
              >
                {uploading() ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        }
      >
        {(id) => (
          <div class="flex flex-col gap-4">
            <div id={titleId} class="text-base font-semibold text-text-primary">
              Logs uploaded
            </div>
            <div class="text-sm text-text-secondary">
              Share this Reference ID with the support team.
            </div>
            <CopyBlock text={id()} label="reference ID" />
            <div class="text-sm text-text-secondary">
              <a
                href={logDiscussionUrl({
                  description: description(),
                  referenceId: id(),
                  packageVersion: appState.packageVersion,
                  system: system(),
                })}
                onClick={(e) => openDiscussion(e, e.currentTarget.href)}
              >
                You can also start a pre-filled discussion on{" "}
                <strong>GitHub</strong> by{" "}
                <span class="text-orange-500 hover:text-orange-700 underline">
                  clicking this link
                </span>
              </a>
            </div>
            <button type="button" class={outlineButtonClass} onClick={close}>
              Close
            </button>
          </div>
        )}
      </Show>
    </Modal>
  );
}
