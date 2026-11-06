import IconButton from "./common/IconButton.tsx";
import BalancePopup from "./BalancePopup.tsx";
import { Portal } from "solid-js/web";
import SettingsIcon from "./icons/SettingsIcon.tsx";
import { openSettings, settingsTab } from "../utils/settingsPage.ts";
import TrafficIcon from "./icons/TrafficIcon.tsx";
import { openTrafficWindow } from "../utils/trafficWindow.ts";
import { isRunningRunMode } from "../services/vpnService.ts";
import LockIcon from "./icons/LockIcon.tsx";
import { deriveOverallStatus } from "../utils/funding.ts";
import {
  computeEffectiveCredit,
  formatCreditCompact,
} from "../utils/credit.ts";
import { createSignal, onCleanup, Show } from "solid-js";
import { gateOnWindowFocus } from "../utils/windowFocus.ts";
import { useAppStore } from "../stores/appStore.ts";
import Tooltip from "./common/Tooltip.tsx";

function Navigation(props: { gearOnly?: boolean }) {
  const [appState] = useAppStore();
  const [showPopup, setShowPopup] = createSignal(false);
  const [buttonRect, setButtonRect] = createSignal<DOMRect | null>(null);
  const [containerRect, setContainerRect] = createSignal<DOMRect | null>(null);
  let buttonRef: HTMLButtonElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let hoverTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  // Bar reflects the worst of traffic and gas status; widths are fixed per level, not a measured fraction.
  const fundsBarClass = () => {
    if (!isRunningRunMode(appState.runMode)) return "bg-status-bad w-[10%]";
    const status = deriveOverallStatus(
      appState.balance,
      appState.runMode.funding_status,
    );
    if (status === "Empty") return "bg-status-bad w-[10%]";
    if (status === "Low") return "bg-status-warn w-[45%]";
    return "bg-control-tint w-full";
  };
  const credit = () =>
    // A non-owner sees no funds, even ones lingering from before the hand-over.
    appState.balance && appState.vpnStatus !== "InUseByOtherUser"
      ? computeEffectiveCredit(appState.balance)
      : null;

  // Set while a checked update is not installed, even after its banner is dismissed.
  const updateWaiting = () => appState.availableVersion !== null;

  const hidePopup = () => {
    clearTimeout(hoverTimeout);
    hoverTimeout = undefined;
    setShowPopup(false);
  };

  // Grace period so the pointer can cross the gap from the button into the popup.
  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(hidePopup, 220);
  };

  const handleMouseEnter = gateOnWindowFocus(() => {
    clearTimeout(hoverTimeout);
    if (showPopup()) return;
    hoverTimeout = setTimeout(() => {
      if (buttonRef && containerRef) {
        setButtonRect(buttonRef.getBoundingClientRect());
        setContainerRect(containerRef.getBoundingClientRect());
      }
      setShowPopup(true);
    }, 500);
  }, hidePopup);

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
          <Show when={!props.gearOnly}>
            {/* The client has no lockdown yet (the kill switch only lives with a connection), so it always reads off */}
            <Tooltip
              content={
                <>
                  <div class="font-bold">Feature coming</div>
                  <div>Lockdown off · click to turn on</div>
                </>
              }
              position="bottom"
            >
              <div
                role="img"
                aria-label="Lockdown off"
                class="w-7.5 h-7.5 rounded-lg flex items-center justify-center bg-control-bg text-text-subtle"
              >
                <LockIcon open />
              </div>
            </Tooltip>
            <Tooltip content="Traffic" position="bottom">
              <IconButton label="Traffic" onClick={() => openTrafficWindow()}>
                <TrafficIcon />
              </IconButton>
            </Tooltip>
            <IconButton
              ref={(el) => (buttonRef = el)}
              label={credit() === null
                ? "Funds"
                : `Funds, ${formatCreditCompact(credit()!)}`}
              onClick={() => {
                hidePopup();
                openSettings("usage");
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {/* w-10.5: "44.4 MB", the widest label formatCreditCompact can return, is 42px in Unica77 Bold 11px */}
              <span class="flex w-10.5 flex-col gap-0.75 text-[11px] leading-3.5 font-bold text-center">
                {/* Explicit null check: credit can be 0n, which Show treats as falsy */}
                <Show when={credit() !== null} fallback={<span>—</span>}>
                  <span class="whitespace-nowrap">
                    {formatCreditCompact(credit()!)}
                  </span>
                </Show>
                <span class="h-0.75 rounded-xs bg-control-bg-hover">
                  <Show when={credit() !== null}>
                    <span
                      class={`block h-full rounded-xs ${fundsBarClass()}`}
                    />
                  </Show>
                </span>
              </span>
            </IconButton>
          </Show>
          {/* The page covers the gear without a mouseleave, so the open page hides the tooltip. */}
          <Tooltip
            content="Settings"
            position="bottom"
            disabled={settingsTab() !== null}
          >
            <IconButton
              label={updateWaiting()
                ? "Settings, update available"
                : "Settings"}
              badge={updateWaiting()}
              onClick={() => openSettings("general")}
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </div>
      </Portal>

      <BalancePopup
        show={showPopup()}
        credit={credit()}
        buttonRect={buttonRect()}
        containerRect={containerRect()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onNavigate={hidePopup}
      />
    </>
  );
}

export default Navigation;
