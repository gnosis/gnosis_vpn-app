import IconButton from "./common/IconButton.tsx";
import { useAppStore } from "../stores/appStore.ts";
import { Portal } from "solid-js/web";
import settingsIcon from "../assets/icons/settings.svg";
import logsIcon from "../assets/icons/logs.svg";
import fundsFullIcon from "../assets/icons/funds-full.svg";
import fundsLowIcon from "../assets/icons/funds-low.svg";
import fundsOutIcon from "../assets/icons/funds-out.svg";
import fundsEmptyIcon from "../assets/icons/funds-empty.svg";

function Navigation() {
  const [appState, appActions] = useAppStore();

  const PRESS_DELAY_MS = 200;
  const navigate = (screen: Parameters<typeof appActions.setScreen>[0]) => {
    window.setTimeout(() => appActions.setScreen(screen), PRESS_DELAY_MS);
  };

  const getFundsIcon = () => {
    const status = appState.fundingStatus;
    if (status === "WellFunded") {
      return fundsFullIcon;
    }
    if (typeof status === "object" && "TopIssue" in status) {
      if (status.TopIssue === "Unfunded" || status.TopIssue === "ChannelsOutOfFunds") {
        return fundsEmptyIcon;
      } else if (status.TopIssue === "SafeLowOnFunds" || status.TopIssue === "NodeLowOnFunds") {
        return fundsLowIcon;
      } else if (status.TopIssue === "NodeUnderfunded" || status.TopIssue === "SafeOutOfFunds") {
        return fundsOutIcon;
      }
    }
    return fundsEmptyIcon;
  };

  return (
    <Portal>
      <div class="fixed top-6 right-4 z-10 flex items-center gap-2 justify-center">
        <IconButton icon={settingsIcon} alt="Settings" onClick={() => navigate("settings")} />
        <IconButton icon={getFundsIcon()} alt="Funds" onClick={() => navigate("usage")} />
        <IconButton icon={logsIcon} alt="Logs" onClick={() => navigate("logs")} />
      </div>
    </Portal>
  );
}

export default Navigation;
