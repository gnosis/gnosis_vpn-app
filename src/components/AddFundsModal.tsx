import FundingAddress from "./address/FundingAddress";
import Button from "./common/Button";
import { Modal } from "./common/Modal";

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
          <div class="text-xl font-bold">Transfer xDAI</div>
          <FundingAddress
            address={props.nodeAddress}
            // full
            title="Transfer xDAI"
          />
        </div>
        <div class="flex flex-col gap-4 my-2">
          <div class="text-xl font-bold">Transfer wxHOPR</div>
          <FundingAddress
            address={props.safeAddress}
            // full
            title="Transfer wxHOPR"
          />
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
