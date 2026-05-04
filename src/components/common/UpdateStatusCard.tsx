import syncIcon from "@assets/icons/sync.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";

interface UpdateStatusCardProps {
  lastChecked?: string;
}

export default function UpdateStatusCard(props: UpdateStatusCardProps) {
  return (
    <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-surface border border-border">
      <div class="relative shrink-0 w-10 h-10">
        <img
          src={syncIcon}
          alt=""
          class="w-10 h-10 tab-icon"
        />
        <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-bg-surface flex items-center justify-center">
          <img src={checkmarkIcon} alt="" class="w-4 h-4" />
        </div>
      </div>
      <div class="flex flex-col">
        <span class="text-sm font-medium text-text-primary">
          You're {props.lastChecked ? "" : "probably"} up to date
        </span>
        <span class="text-xs text-text-secondary">
          Last checked: {props.lastChecked ?? "Never"}
        </span>
      </div>
    </div>
  );
}
