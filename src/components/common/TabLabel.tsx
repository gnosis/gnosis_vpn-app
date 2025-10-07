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
    <div class="flex flex-col items-center gap-1 w-16 h-16 p-2">
      <div class="w-full flex-grow flex items-center justify-center">
        <img src={getIcon()} alt={props.label} class="h-10 w-10" />
      </div>
      <span class="text-xs">{props.label}</span>
    </div>
  );
}
