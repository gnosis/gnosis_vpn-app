import { Show } from "solid-js";
import syncIcon from "@assets/icons/sync.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";

interface UpdateStatusCardProps {
  lastChecked?: string;
  onCheck?: () => void;
  loading?: boolean;
  isUpToDate?: boolean;
}

export default function UpdateStatusCard(props: UpdateStatusCardProps) {
  const showCheckmark = () => !props.loading && props.isUpToDate !== false;

  const statusText = () => {
    if (props.isUpToDate === true) return "You're up to date";
    if (props.isUpToDate === false) return "Update available";
    return "You're probably up to date";
  };

  return (
    <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-surface border border-border">
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
      <div class="flex flex-col">
        <span class={`text-sm font-medium ${props.isUpToDate === false ? "text-orange-500" : "text-text-primary"}`}>
          {statusText()}
        </span>
        <span class="text-xs text-text-secondary">
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
