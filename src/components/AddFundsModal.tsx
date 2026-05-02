import FundingAddress from "./address/FundingAddress.tsx";
import Button from "./common/Button.tsx";
import { Modal } from "./common/Modal.tsx";

export default function AddFundsModal(props: {
  open: boolean;
  onClose: () => void;
  nodeAddress: string;
  safeAddress: string;
}) {
  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div class="flex flex-col gap-8">
        <div class="text-base font-semibold">Add funds</div>
        <div class="flex flex-col gap-4 my-2">
          <FundingAddress
            address={props.nodeAddress}
            full
            qrVisible
          />
          <div class="text-sm">
            You can transfer or
            <span class="font-bold">xDAI</span> or
            <span class="font-bold">wxHOPR</span> on
            <span class="font-bold">Gnosis Chain</span>.
          </div>
        </div>
        <div class="flex flex-row justify-end gap-2">
          <Button size="md" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
