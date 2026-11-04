import settingsIcon from "@src/components/icons/tab-settings.svg";
import usageIcon from "@src/components/icons/tab-wallet.svg";
import updatesIcon from "@src/components/icons/tab-updates.svg";
import aboutIcon from "@src/components/icons/tab-about.svg";

export default function TabLabel(props: { label: string }) {
  const getIcon = () => {
    switch (props.label) {
      case "Settings":
        return settingsIcon;
      case "Usage":
        return usageIcon;
      case "Updates":
        return updatesIcon;
      case "About":
        return aboutIcon;
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
