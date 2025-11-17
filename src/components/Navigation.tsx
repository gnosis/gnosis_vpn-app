import IconButton from "@src/components/common/IconButton.tsx";
import { Portal } from "solid-js/web";
import settingsIcon from "@assets/icons/settings.svg";
import logsIcon from "@assets/icons/logs.svg";
// import fundsFullIcon from "@assets/icons/funds-full.svg";
// import fundsLowIcon from "@assets/icons/funds-low.svg";
// import fundsOutIcon from "@assets/icons/funds-out.svg";
import fundsEmptyIcon from "@assets/icons/funds-empty.svg";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
// import { useAppStore } from "@src/stores/appStore.ts";

function Navigation() {
  // const [appState, appActions] = useAppStore();
  const openSettingsWindow = async (target?: "settings" | "usage" | "logs") => {
    const settingsWin = await WebviewWindow.getByLabel("settings");
    if (settingsWin) {
      await settingsWin.show();
      await settingsWin.setFocus();
      if (target) {
        await settingsWin.emit("navigate", target);
      }
    }
  };

  // const getFundsIcon = () => {
  //   const status = appState.fundingStatus;
  //   if (status === "WellFunded") {
  //     return fundsFullIcon;
  //   }
  //   if (typeof status === "object" && "TopIssue" in status) {
  //     switch (status.TopIssue) {
  //       case "Unfunded":
  //       case "ChannelsOutOfFunds":
  //         return fundsEmptyIcon;
  //       case "SafeLowOnFunds":
  //       case "NodeLowOnFunds":
  //         return fundsLowIcon;
  //       case "NodeUnderfunded":
  //       case "SafeOutOfFunds":
  //         return fundsOutIcon;
  //     }
  //   }
  //   return fundsEmptyIcon;
  // };

  const getFundsIcon = () => fundsEmptyIcon;

  return (
    <Portal>
      <div class="fixed top-6 right-4 z-60 flex items-center gap-2 justify-center">
        <IconButton
          icon={settingsIcon}
          alt="Settings"
          onClick={() => openSettingsWindow("settings")}
        />
        <IconButton
          icon={getFundsIcon()}
          alt="Funds"
          onClick={() => openSettingsWindow("usage")}
        />
        <IconButton
          icon={logsIcon}
          alt="Logs"
          onClick={() => openSettingsWindow("logs")}
        />
      </div>
    </Portal>
  );
}

export default Navigation;
