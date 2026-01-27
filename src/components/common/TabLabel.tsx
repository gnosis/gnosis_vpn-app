import settingsIcon from "@assets/icons/tab-settings.svg";
import usageIcon from "@assets/icons/tab-wallet.svg";
import logsIcon from "@assets/icons/tab-logs.svg";

export default function TabLabel(props: { label: string }) {
  const getIcon = () => {
    switch (props.label) {
      case "Settings":
        return settingsIcon;
      case "Usage":
        return usageIcon;
      case "Logs":
        return logsIcon;
    }
  };

  return (
    <div class="flex flex-col items-center gap-1 w-12 h-12 p-2">
      <div class="w-full grow flex items-center justify-center text-text-primary">
        <img
          src={getIcon()}
          alt={props.label}
          class="h-6 w-6 tab-icon"
        />
      </div>
      <span class="text-xs text-text-primary">{props.label}</span>
    </div>
  );
}
