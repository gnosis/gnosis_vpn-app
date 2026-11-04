import IconButton from "./common/IconButton.tsx";
import BalancePopup from "./BalancePopup.tsx";
import { Portal } from "solid-js/web";
import SettingsIcon from "./icons/SettingsIcon.tsx";
import { openSettingsWindow } from "../utils/settingsWindow.ts";
import TrafficIcon from "./icons/TrafficIcon.tsx";
import { openTrafficWindow } from "../utils/trafficWindow.ts";
import { isRunningRunMode } from "../services/vpnService.ts";
import WalletIcon from "./icons/WalletIcon.tsx";
import { deriveOverallStatus } from "../utils/funding.ts";
import { createSignal, onCleanup } from "solid-js";
import { gateOnWindowFocus } from "../utils/windowFocus.ts";
import { useAppStore } from "../stores/appStore.ts";
import Tooltip from "./common/Tooltip.tsx";

function Navigation() {
  const [appState] = useAppStore();
  const [showPopup, setShowPopup] = createSignal(false);
  const [buttonRect, setButtonRect] = createSignal<DOMRect | null>(null);
  const [containerRect, setContainerRect] = createSignal<DOMRect | null>(null);
  let buttonRef: HTMLButtonElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let hoverTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  // Icon reflects the worst of traffic and gas status, matching the two
  // status dots in the balance popup.
  const fundsBillsClass = () => {
    if (!isRunningRunMode(appState.runMode)) return "text-status-bad";
    const status = deriveOverallStatus(
      appState.balance,
      appState.runMode.funding_status,
    );
    if (status === "Empty") return "text-status-bad";
    if (status === "Low") return "text-status-warn";
    return undefined;
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout);
    hoverTimeout = undefined;
    setShowPopup(false);
  };

  const handleMouseEnter = gateOnWindowFocus(() => {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      if (buttonRef && containerRef) {
        setButtonRect(buttonRef.getBoundingClientRect());
        setContainerRect(containerRef.getBoundingClientRect());
      }
      setShowPopup(true);
    }, 500);
  }, handleMouseLeave);

  onCleanup(() => {
    clearTimeout(hoverTimeout);
  });

  return (
    <>
      <Portal>
        <div
          ref={(el) => (containerRef = el)}
          class="fixed top-6 right-4 z-60 flex items-center gap-1.5 justify-center"
        >
          <IconButton
            ref={(el) => (buttonRef = el)}
            label="Funds"
            onClick={() => openSettingsWindow("usage")}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <WalletIcon billsClass={fundsBillsClass()} />
          </IconButton>
          <Tooltip content="Traffic" position="bottom">
            <IconButton label="Traffic" onClick={() => openTrafficWindow()}>
              <TrafficIcon />
            </IconButton>
          </Tooltip>
          <Tooltip content="Settings" position="bottom">
            <IconButton
              label="Settings"
              onClick={() => openSettingsWindow("settings")}
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
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
