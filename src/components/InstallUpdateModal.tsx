import { Modal } from "./common/Modal.tsx";

const btn =
  "h-10 px-4 text-sm rounded-lg font-bold hover:cursor-pointer transition-colors select-none";
// the main screen's Connect and More locations buttons
const connectBtn =
  `${btn} bg-btn-connect-bg text-btn-connect-text hover:bg-btn-connect-hover`;
const listBtn =
  `${btn} bg-bg-list text-text-primary shadow-[inset_0_0_0_1px_var(--color-control-ring)] hover:bg-control-bg`;

export default function InstallUpdateModal(props: {
  open: boolean;
  onClose: () => void;
  onInstallAnyway: () => void;
  onConnectAndInstall: () => void;
}) {
  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          <div class="text-base font-semibold text-text-primary">
            Your connection is not private
          </div>
          <div class="text-sm text-text-secondary">
            Downloading the update without VPN reveals your IP address. Connect
            through Gnosis VPN first for a private download.
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <button
            type="button"
            class={connectBtn}
            onClick={props.onConnectAndInstall}
          >
            Connect and install
          </button>
          <button
            type="button"
            class={listBtn}
            onClick={props.onInstallAnyway}
          >
            Install anyway
          </button>
          <button
            type="button"
            class={listBtn}
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
