import { createResource, createSignal, Show } from "solid-js";
<<<<<<< HEAD
import syncIcon from "@assets/icons/sync.svg";
import refreshIcon from "@assets/icons/refresh.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";
import { Modal } from "./Modal.tsx";
import { Markdown } from "./Markdown.tsx";
=======
>>>>>>> 2c05a4f (feat(ui): address 626 review follow ups releasehoprdv4 (#627))
import HowToUpdateModal from "./HowToUpdateModal.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { push } from "@src/stores/pageStack.ts";
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

<<<<<<< HEAD
=======
/** Icon, headline, the installed and available versions, the last check, and the one button that matters now. */
>>>>>>> 2c05a4f (feat(ui): address 626 review follow ups releasehoprdv4 (#627))
export default function UpdateStatusCard(props: UpdateStatusCardProps) {
  const [appState] = useAppStore();
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

<<<<<<< HEAD
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
        <Show when={appState.packageVersion && showCheckmark()}>
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
      <Show when={updateAvailable() && !props.loading && !installing()}>
        <button
          type="button"
          class="shrink-0 -mr-2 h-8 w-8 flex items-center justify-center rounded-md border border-border bg-transparent transition-colors hover:bg-darken hover:cursor-pointer"
          title="Check for updates"
          aria-label="Check for updates"
          onClick={() => props.onCheck?.()}
        >
          <img
            src={refreshIcon}
            alt="Check for updates"
            class="w-4 h-4 tab-icon"
          />
        </button>
      </Show>
      <button
        type="button"
        class={`shrink-0 h-8 px-3 text-sm rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:cursor-pointer ${
          updateAvailable()
            ? "bg-green-100 border-green-300 text-green-800 hover:enabled:bg-green-200 dark:bg-green-500/15 dark:border-green-500/40 dark:text-green-300 dark:hover:enabled:bg-green-500/25"
            : "border-border bg-transparent text-text-primary hover:enabled:bg-darken"
        }`}
        disabled={props.loading || installing() ||
          (updateAvailable() && platform.loading)}
        onClick={handleButtonClick}
      >
        {buttonLabel()}
      </button>
=======
  const iconClass = () => {
    if (busy()) return "text-text-secondary animate-spin-smooth";
    if (updateAvailable()) return "text-text-orange";
    if (props.isUpToDate === true) return "text-text-green";
    return "text-text-secondary";
  };

  const installedLine = () =>
    appState.packageVersion
      ? `Installed ${appState.packageVersion}`
      : "Installed version unknown";

  const checkedLine = () =>
    props.lastChecked ? `Checked ${props.lastChecked}` : "Never checked";

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
      <div class="flex items-start gap-3">
        <SyncIcon class={`mt-px size-5 shrink-0 ${iconClass()}`} />
        {/* One fact per line: long build versions wrap badly when joined into one sentence. */}
        <div class="flex min-w-0 flex-1 flex-col gap-0.5 text-xs leading-snug text-text-secondary">
          <span
            class={`text-sm font-semibold leading-tight ${
              updateAvailable() ? "text-text-orange" : "text-text-primary"
            }`}
          >
            {statusText()}
          </span>
          <span class="break-all">{installedLine()}</span>
          <Show when={updateAvailable() && props.latestVersion}>
            {(latest) => (
              <span class="text-text-orange">
                <span class="break-all">Available {latest()}</span>
                <Show when={props.releaseNotes}>
                  {" · "}
                  <button
                    type="button"
                    class="underline"
                    onClick={() => push("changelog")}
                  >
                    changelog
                  </button>
                </Show>
              </span>
            )}
          </Show>
          <span>{checkedLine()}</span>
          <Show when={props.installError}>
            {(error) => (
              <span class="break-words text-text-red">
                Update failed — {error()}
              </span>
            )}
          </Show>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Show when={updateAvailable() && !busy()}>
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
      </div>
>>>>>>> 2c05a4f (feat(ui): address 626 review follow ups releasehoprdv4 (#627))
      <HowToUpdateModal
        open={showHowTo()}
        onClose={() => setShowHowTo(false)}
      />
    </div>
  );
}
