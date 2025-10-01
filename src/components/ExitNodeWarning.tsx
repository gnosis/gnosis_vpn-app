import { Modal } from "@src/components/common/Modal";
import Button from "@src/components/common/Button";

export default function ExitNodeWarning(
  props: { open: boolean; onCancel: () => void; onProceed: () => void },
) {
  return (
    <Modal open={props.open} onClose={props.onCancel}>
      <p>Please note, selecting a custom Exit node costs...</p>
      <div class="flex flex-row gap-2 mt-4">
        <Button onClick={props.onCancel} size="md" variant="secondary">
          Cancel
        </Button>
        <Button onClick={props.onProceed} size="md" variant="primary">
          Proceed
        </Button>
      </div>
    </Modal>
  );
}
