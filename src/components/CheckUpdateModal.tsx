import { Modal } from "./common/Modal.tsx";

const btn =
  "grow h-10 px-4 text-sm rounded-lg font-bold hover:bg-darken hover:cursor-pointer transition-colors select-none";

export default function CheckUpdateModal(props: {
  open: boolean;
  onClose: () => void;
  onCheckAnyway: () => void;
  onConnectAndCheck: () => void;
}) {
  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          <div class="text-base font-semibold text-text-primary">
            Your connection is not private
          </div>
          <div class="text-sm text-text-secondary">
            Checking for updates without VPN reveals your IP address. Connect
            through Gnosis VPN first for a private check.
          </div>
        </div>
        <div class="flex flex-row justify-between gap-2">
          <button
            type="button"
            class={`${btn} bg-vpn-light-green text-white`}
            onClick={props.onConnectAndCheck}
          >
            Connect and check
          </button>
          <button
            type="button"
            class={`${btn} bg-vpn-red text-white`}
            onClick={props.onCheckAnyway}
          >
            Check anyway
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
