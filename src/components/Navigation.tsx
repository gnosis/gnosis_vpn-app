import IconButton from "@src/components/common/IconButton.tsx";
import { useAppStore } from "@src/stores/appStore.ts";
import { Portal } from "solid-js/web";
import settingsIcon from "@assets/icons/settings.svg";
import logsIcon from "@assets/icons/logs.svg";
import fundsFullIcon from "@assets/icons/funds-full.svg";
import fundsLowIcon from "@assets/icons/funds-low.svg";
import fundsOutIcon from "@assets/icons/funds-out.svg";
import fundsEmptyIcon from "@assets/icons/funds-empty.svg";

function Navigation() {
  const [appState, appActions] = useAppStore();

  const PRESS_DELAY_MS = 200;
  const navigate = (screen: Parameters<typeof appActions.setScreen>[0]) => {
    globalThis.setTimeout(() => appActions.setScreen(screen), PRESS_DELAY_MS);
  };

  const getFundsIcon = () => {
    const status = appState.fundingStatus;
    if (status === "WellFunded") {
      return fundsFullIcon;
    }
    if (typeof status === "object" && "TopIssue" in status) {
      switch (status.TopIssue) {
        case "Unfunded":
        case "ChannelsOutOfFunds":
          return fundsEmptyIcon;
        case "SafeLowOnFunds":
        case "NodeLowOnFunds":
          return fundsLowIcon;
        case "NodeUnderfunded":
        case "SafeOutOfFunds":
          return fundsOutIcon;
      }
    }
    return fundsEmptyIcon;
  };

  return (
    <Portal>
      <div class="fixed top-6 right-4 z-60 flex items-center gap-2 justify-center">
        <IconButton
          icon={settingsIcon}
          alt="Settings"
          onClick={() => navigate("settings")}
        />
        <IconButton
          icon={getFundsIcon()}
          alt="Funds"
          onClick={() => navigate("usage")}
        />
        <IconButton
          icon={logsIcon}
          alt="Logs"
          onClick={() => navigate("logs")}
        />
      </div>
    </Portal>
  );
}

export default Navigation;
