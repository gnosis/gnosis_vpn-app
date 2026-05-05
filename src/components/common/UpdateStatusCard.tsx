import syncIcon from "@assets/icons/sync.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";

interface UpdateStatusCardProps {
  lastChecked?: string;
  onCheck?: () => void;
  loading?: boolean;
}

// TODO: 
// TODO: on checking, use the check-update from the gnosis vpn client lib. The green checkmark should dissapear, the round arrows should rotate. When checked and we are on the newest version, all should come back to the same state. Newest versions (stable and snapshot) should be saved both the store and permanently. Also, the channel of the app should be saved in the app store and permanently. If it's empty, it should check the package version and based on that, decide what channel is that.
// TODO: make theme selector into 2 components: reuasable choice componennt (name it better) and a theme selector that uses that component
// Use the newly created component to create a choice between stalbe and snapshot channel for updates. In the store, based on permentent data saved, you shoud h
// check os version for the update


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
