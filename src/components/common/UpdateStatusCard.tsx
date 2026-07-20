import { createResource, createSignal, Show } from "solid-js";
import syncIcon from "@assets/icons/sync.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";
import { Modal } from "./Modal.tsx";
import { Markdown } from "./Markdown.tsx";
import HowToUpdateModal from "./HowToUpdateModal.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { getPlatform } from "@src/utils/platform.ts";

// UI phases of a driven install (macOS): mapped from the updater's
// update-install-status events by Updates.tsx. "installing" holds through
// Completed — the installer restarts the app itself.
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

export default function UpdateStatusCard(props: UpdateStatusCardProps) {
  const [appState] = useAppStore();
  const [showChangelog, setShowChangelog] = createSignal(false);
  const [showHowTo, setShowHowTo] = createSignal(false);
  const [platform, { refetch: refetchPlatform }] = createResource(getPlatform);
  const installing = () => props.installPhase != null;
  const showCheckmark = () =>
    !props.loading && !installing() && props.isUpToDate !== false;
  const updateAvailable = () => props.isUpToDate === false;

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
    if (props.isUpToDate === true) {
      return `You're up to date`;
    }
    if (props.isUpToDate === false) return `Update available`;
    return `You're probably up to date`;
  };

  return (
    <div
      class="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-surface border border-border"
      style="height: 78px"
    >
      <div class="relative shrink-0 w-10 h-10">
        <img
          src={syncIcon}
          alt=""
          class={`w-10 h-10 tab-icon${
            props.loading || installing() ? " animate-spin" : ""
          }`}
        />
        <Show when={appState.serviceInfo?.package_version && showCheckmark()}>
          <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-bg-surface flex items-center justify-center">
            <img src={checkmarkIcon} alt="" class="w-4 h-4" />
          </div>
        </Show>
      </div>
      <div class="flex flex-col self-stretch min-w-0 overflow-hidden">
        <span
          class={`text-sm font-medium truncate ${
            props.isUpToDate === false ? "text-orange-500" : "text-text-primary"
          }`}
        >
          {statusText()}
        </span>
        <Show when={props.isUpToDate === false && props.latestVersion}>
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs text-orange-500 truncate">
              {props.latestVersion}
            </span>
            <Show when={props.releaseNotes}>
              <button
                type="button"
                class="shrink-0 text-xs text-orange-500 underline hover:cursor-pointer"
                onClick={() => setShowChangelog(true)}
              >
                (changelog)
              </button>
            </Show>
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
              class="h-10 px-4 text-sm rounded-lg font-bold border border-border bg-transparent text-text-primary hover:bg-darken hover:cursor-pointer transition-colors"
              onClick={() => setShowChangelog(false)}
            >
              Close
            </button>
          </div>
        </Modal>
        <Show
          when={props.installError}
          fallback={
            <span class="mt-auto text-xs text-text-secondary">
              Last checked: {props.lastChecked ?? "Never"}
            </span>
          }
        >
          <span
            class="mt-auto text-xs text-red-500 truncate"
            title={props.installError ?? undefined}
          >
            Update failed — {props.installError}
          </span>
        </Show>
      </div>
      <div class="grow" />
      <button
        type="button"
        class="shrink-0 h-8 px-3 text-sm rounded-md border border-border bg-transparent text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-darken hover:enabled:cursor-pointer"
        disabled={props.loading || installing() ||
          (updateAvailable() && platform.loading)}
        onClick={handleButtonClick}
      >
        {buttonLabel()}
      </button>
      <HowToUpdateModal
        open={showHowTo()}
        onClose={() => setShowHowTo(false)}
      />
    </div>
  );
}
