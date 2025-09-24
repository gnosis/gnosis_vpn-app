import IconButton from "./common/IconButton.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { Portal } from "solid-js/web";
import settingsIcon from "../assets/icons/settings.svg";
import usageIcon from "../assets/icons/usage-full.svg";
import logsIcon from "../assets/icons/logs.svg";

function Navigation() {
  const [, appActions] = useAppStore();

  const getUsageIcon = () => {
    return usageIcon;
  };

  return (
    <Portal>
      <div class="fixed top-4 right-4 z-10 flex items-center gap-2 justify-center">
        <IconButton icon={settingsIcon} alt="Settings" onClick={() => appActions.setScreen("settings")} />
        <IconButton icon={getUsageIcon()} alt="Usage" onClick={() => appActions.setScreen("usage")} />
        <IconButton icon={logsIcon} alt="Logs" onClick={() => appActions.setScreen("logs")} />
      </div>
    </Portal>
  );
}

export default Navigation;
