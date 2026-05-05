import { createSignal, Show } from "solid-js";
import syncIcon from "@assets/icons/sync.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";
import { Modal } from "./Modal.tsx";
import { Markdown } from "./Markdown.tsx";

interface UpdateStatusCardProps {
  lastChecked?: string;
  onCheck?: () => void;
  loading?: boolean;
  isUpToDate?: boolean;
  latestVersion?: string;
  releaseNotes?: string;
}

export default function UpdateStatusCard(props: UpdateStatusCardProps) {
  const [showChangelog, setShowChangelog] = createSignal(false);
  const showCheckmark = () => !props.loading && props.isUpToDate !== false;

  const statusText = () => {
    if (props.isUpToDate === true) return "You're up to date";
    if (props.isUpToDate === false) return "Update available";
    return "You're probably up to date";
  };

  return (
    <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-surface border border-border" style="height: 78px">
      <div class="relative shrink-0 w-10 h-10">
        <img
          src={syncIcon}
          alt=""
          class={`w-10 h-10 tab-icon${props.loading ? " animate-spin" : ""}`}
        />
        <Show when={showCheckmark()}>
          <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-bg-surface flex items-center justify-center">
            <img src={checkmarkIcon} alt="" class="w-4 h-4" />
          </div>
        </Show>
      </div>
      <div class="flex flex-col self-stretch min-w-0 overflow-hidden">
        <span class={`text-sm font-medium truncate ${props.isUpToDate === false ? "text-orange-500" : "text-text-primary"}`}>
          {statusText()}
        </span>
        <Show when={props.isUpToDate === false && props.latestVersion}>
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs text-orange-500 truncate">{props.latestVersion}</span>
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
            <div class="max-h-64 overflow-y-auto pr-2">
              <Markdown>{props.releaseNotes || ""}</Markdown>
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
        <span class="mt-auto text-xs text-text-secondary">
          Last checked: {props.lastChecked ?? "Never"}
        </span>
      </div>
      <div class="grow" />
      <button
        type="button"
        class="shrink-0 h-8 px-3 text-sm rounded-md border border-border bg-transparent text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-darken hover:enabled:cursor-pointer"
        disabled={props.loading}
        onClick={props.onCheck}
      >
        {props.loading ? "Checking…" : "Check now"}
      </button>
    </div>
  );
}
