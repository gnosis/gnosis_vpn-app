import { createResource, createSignal, Show } from "solid-js";
import { Modal } from "./Modal.tsx";
import { Markdown } from "./Markdown.tsx";
import HowToUpdateModal from "./HowToUpdateModal.tsx";
import SyncIcon from "../icons/SyncIcon.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { getPlatform } from "@src/utils/platform.ts";

// UI phases of a driven install (macOS): mapped from the updater's
// update-install-status events by the Software update page. "installing"
// holds through Completed — the installer restarts the app itself.
export type InstallPhase = "downloading" | "installing";

const INSTALL_LABELS: Record<InstallPhase, string> = {
  downloading: "Downloading…",
  installing: "Installing…",
};

interface UpdateStatusCardProps {
  lastChecked?: string;
  onCheck?: () => void;
  loading?: boolean;
  isUpToDate?: boolean;
  latestVersion?: string;
  releaseNotes?: string;
  // Starts the driven install; only used on macOS (other platforms get the
  // how-to-update instructions instead).
  onInstall?: () => void;
  installPhase?: InstallPhase | null;
  installError?: string | null;
}

/** Icon, headline, one muted line of version and last check, and the one button that matters now. */
export default function UpdateStatusCard(props: UpdateStatusCardProps) {
  const [appState] = useAppStore();
  const [showChangelog, setShowChangelog] = createSignal(false);
  const [showHowTo, setShowHowTo] = createSignal(false);
  const [platform, { refetch: refetchPlatform }] = createResource(getPlatform);
  const installing = () => props.installPhase != null;
  const updateAvailable = () => props.isUpToDate === false;
  const busy = () => props.loading || installing();

  const handleButtonClick = async () => {
    if (!updateAvailable()) {
      props.onCheck?.();
      return;
    }
    if (platform.loading) {
      // Don't pick an install path before the platform is known — clicking
      // right after mount must not open the Linux how-to on macOS.
      return;
    }
    // A failed probe resolves to "unknown"; retry on click so a transient
    // failure can't pin macOS on the manual path for the mount's lifetime.
    const os = platform() === "unknown" ? await refetchPlatform() : platform();
    if (os === "macos") {
      // macOS ships /usr/local/bin/gnosis_vpn-update; the app drives it.
      props.onInstall?.();
    } else {
      // Elsewhere updating is manual; show the instructions.
      setShowHowTo(true);
    }
  };

  const buttonLabel = () => {
    if (props.installPhase) return INSTALL_LABELS[props.installPhase];
    if (props.loading) return "Checking…";
    return updateAvailable() ? "Install update" : "Check now";
  };

  const statusText = () => {
    if (props.loading) return "Checking for updates…";
    if (props.isUpToDate === true) return "You're up to date";
    if (props.isUpToDate === false) return "Update available";
    return "You're probably up to date";
  };

  const iconClass = () => {
    if (busy()) return "text-text-secondary animate-spin-smooth";
    if (updateAvailable()) return "text-text-orange";
    if (props.isUpToDate === true) return "text-text-green";
    return "text-text-secondary";
  };

  const detailLine = () => {
    const version = appState.packageVersion
      ? `Version ${appState.packageVersion}`
      : "Version unknown";
    return `${version} · ${
      props.lastChecked ? `checked ${props.lastChecked}` : "never checked"
    }`;
  };

  const actionButton = (
    <button
      type="button"
      class={`h-8 shrink-0 rounded-md border px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 ${
        updateAvailable()
          ? "border-vpn-light-green/40 bg-vpn-light-green/15 text-text-green hover:enabled:bg-vpn-light-green/25"
          : "border-border bg-transparent text-text-primary hover:enabled:bg-darken"
      }`}
      disabled={busy() || (updateAvailable() && platform.loading)}
      onClick={handleButtonClick}
    >
      {buttonLabel()}
    </button>
  );

  return (
    <div class="flex flex-col gap-3 rounded-xl border border-border bg-bg-surface px-3 py-3">
      <div class="flex items-center gap-3">
        <SyncIcon class={`size-6 shrink-0 ${iconClass()}`} />
        <div class="flex min-w-0 flex-1 flex-col">
          <span
            class={`text-sm font-semibold leading-tight ${
              updateAvailable() ? "text-text-orange" : "text-text-primary"
            }`}
          >
            {statusText()}
          </span>
          <Show
            when={props.installError}
            fallback={
              <span class="text-xs leading-snug text-text-secondary">
                {detailLine()}
              </span>
            }
          >
            <span
              class="truncate text-xs text-text-red"
              title={props.installError ?? undefined}
            >
              Update failed — {props.installError}
            </span>
          </Show>
        </div>
        {/* With an update the actions get their own row below; there is no room beside the text. */}
        <Show when={!updateAvailable()}>{actionButton}</Show>
      </div>
      <Show when={updateAvailable()}>
        <div class="flex items-center justify-between gap-2 border-t border-border pt-3">
          <span class="flex min-w-0 items-center gap-2 text-xs text-text-orange">
            <span class="truncate">{props.latestVersion}</span>
            <Show when={props.releaseNotes}>
              <button
                type="button"
                class="shrink-0 underline"
                onClick={() => setShowChangelog(true)}
              >
                changelog
              </button>
            </Show>
          </span>
          <span class="flex shrink-0 items-center gap-2">
            <Show when={!busy()}>
              <button
                type="button"
                class="flex size-8 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
                title="Check again"
                aria-label="Check again"
                onClick={() => props.onCheck?.()}
              >
                <SyncIcon class="size-4" />
              </button>
            </Show>
            {actionButton}
          </span>
        </div>
      </Show>
      <Modal open={showChangelog()} onClose={() => setShowChangelog(false)}>
        <div class="flex flex-col gap-4">
          <div class="text-base font-semibold text-text-primary">
            What's new in {props.latestVersion}
          </div>
          <div class="max-h-64 overflow-y-auto">
            <div class="pr-[18px]">
              <Markdown>{props.releaseNotes || ""}</Markdown>
            </div>
          </div>
          <button
            type="button"
            class="h-10 rounded-lg border border-border bg-transparent px-4 text-sm font-bold text-text-primary transition-colors hover:bg-darken"
            onClick={() => setShowChangelog(false)}
          >
            Close
          </button>
        </div>
      </Modal>
      <HowToUpdateModal
        open={showHowTo()}
        onClose={() => setShowHowTo(false)}
      />
    </div>
  );
}
