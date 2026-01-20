import IconButton from "@src/components/common/IconButton.tsx";
import BalancePopup from "@src/components/BalancePopup.tsx";
import { Portal } from "solid-js/web";
import settingsIcon from "@assets/icons/settings.svg";
import logsIcon from "@assets/icons/logs.svg";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isRunningRunMode } from "@src/services/vpnService";
import fundsFullIcon from "@assets/icons/funds-full.svg";
import fundsLowIcon from "@assets/icons/funds-low.svg";
import fundsOutIcon from "@assets/icons/funds-out.svg";
import fundsEmptyIcon from "@assets/icons/funds-empty.svg";
import { createSignal } from "solid-js";
import { useAppStore } from "@src/stores/appStore";

function Navigation() {
  const [appState] = useAppStore();
  const [showPopup, setShowPopup] = createSignal(false);
  const [buttonRect, setButtonRect] = createSignal<DOMRect | null>(null);
  const [containerRect, setContainerRect] = createSignal<DOMRect | null>(null);
  let buttonRef: HTMLButtonElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let hoverTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

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

  const getFundsIcon = () => {
    const status = isRunningRunMode(appState.runMode)
      ? appState.runMode.Running.funding
      : undefined;
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

  const handleMouseEnter = () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      if (buttonRef && containerRef) {
        setButtonRect(buttonRef.getBoundingClientRect());
        setContainerRect(containerRef.getBoundingClientRect());
      }
      setShowPopup(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    setShowPopup(false);
  };

  return (
    <>
      <Portal>
        <div
          ref={(el) => (containerRef = el)}
          class="fixed top-6 right-4 z-60 flex items-center gap-2 justify-center"
        >
          <IconButton
            icon={settingsIcon}
            alt="Settings"
            onClick={() => openSettingsWindow("settings")}
          />
          <IconButton
            ref={(el) => (buttonRef = el)}
            icon={getFundsIcon()}
            alt="Funds"
            onClick={() => openSettingsWindow("usage")}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
          <IconButton
            icon={logsIcon}
            alt="Logs"
            onClick={() => openSettingsWindow("logs")}
          />
        </div>
      </Portal>

      <BalancePopup
        show={showPopup()}
        buttonRect={buttonRect()}
        containerRect={containerRect()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    </>
  );
}

export default Navigation;
