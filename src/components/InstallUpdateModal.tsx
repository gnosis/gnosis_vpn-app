import { Modal } from "./common/Modal.tsx";

const btn =
  "grow h-10 px-4 text-sm rounded-lg font-bold hover:bg-darken hover:cursor-pointer transition-colors select-none";

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
        <div class="flex flex-row justify-between gap-2">
          <button
            type="button"
            class={`${btn} bg-vpn-light-green text-white`}
            onClick={props.onConnectAndInstall}
          >
            Connect and install
          </button>
          <button
            type="button"
            class={`${btn} bg-vpn-red text-white`}
            onClick={props.onInstallAnyway}
          >
            Install anyway
          </button>
          <button
            type="button"
            class={`${btn} border border-border bg-transparent text-text-primary`}
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
