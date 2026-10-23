import IconButton from "./common/IconButton.tsx";
import WalletPopover from "./WalletPopover.tsx";
import { Portal } from "solid-js/web";
import settingsIcon from "../assets/icons/settings.svg";
import {
  consumeWalletRequest,
  push,
  walletRequested,
} from "../stores/pageStack.ts";
import { isRunningRunMode } from "../services/vpnService.ts";
import fundsFullIcon from "../assets/icons/funds-full.svg";
import fundsOutIcon from "../assets/icons/funds-out.svg";
import fundsEmptyIcon from "../assets/icons/funds-empty.svg";
import { deriveOverallStatus } from "../utils/funding.ts";
import { createEffect, createSignal, Show } from "solid-js";
import { useAppStore } from "../stores/appStore.ts";
import Tooltip from "./common/Tooltip.tsx";
import type { PickerFrame } from "./exitNode/LocationPicker.tsx";

function Navigation(props: {
  // The column the wallet popover keeps to; measured when it opens.
  pickerFrame?: () => PickerFrame | null;
}) {
  const [appState] = useAppStore();
  const [walletAnchor, setWalletAnchor] = createSignal<DOMRect | null>(null);
  const [walletFrame, setWalletFrame] = createSignal<PickerFrame | null>(null);
  let walletButtonRef: HTMLButtonElement | undefined;

  // Icon reflects the worst of traffic and gas status, matching the two
  // status labels in the wallet popover.
  const getFundsIcon = () => {
    if (!isRunningRunMode(appState.runMode)) return fundsEmptyIcon;
    const status = deriveOverallStatus(
      appState.balance,
      appState.runMode.Running.funding_status,
    );
    if (status === "Empty") return fundsEmptyIcon;
    if (status === "Low") return fundsOutIcon;
    return fundsFullIcon;
  };

  const openWallet = () => {
    if (!walletButtonRef) return;
    setWalletFrame(props.pickerFrame?.() ?? null);
    setWalletAnchor(walletButtonRef.getBoundingClientRect());
  };
  const closeWallet = () => {
    setWalletAnchor(null);
    walletButtonRef?.focus();
  };
  const toggleWallet = () => (walletAnchor() ? closeWallet() : openWallet());

  // The tray's "Usage" lands here as a request to open the popover. Consumed
  // here, so a request kept while another screen showed opens it on mount and
  // never replays on a later mount.
  createEffect(() => {
    if (!walletRequested()) return;
    consumeWalletRequest();
    openWallet();
  });

  return (
    <>
      <Portal>
        <div class="fixed top-6 right-4 z-60 flex items-center gap-2 justify-center">
          <Tooltip content="Balance" position="bottom">
            <IconButton
              ref={(el) => (walletButtonRef = el)}
              icon={getFundsIcon()}
              alt="Balance"
              onClick={toggleWallet}
            />
          </Tooltip>
          <Tooltip content="Settings" position="bottom">
            <IconButton
              icon={settingsIcon}
              alt="Settings"
              onClick={() => push("settings")}
            />
          </Tooltip>
        </div>
      </Portal>

      <Show when={walletAnchor()}>
        {(anchor) => (
          <WalletPopover
            anchor={anchor()}
            frame={walletFrame()}
            onClose={closeWallet}
            onAddFunds={() => {
              setWalletAnchor(null);
              push("add-funds");
            }}
          />
        )}
      </Show>
    </>
  );
}

export default Navigation;
