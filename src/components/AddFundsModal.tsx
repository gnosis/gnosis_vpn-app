import { Show } from "solid-js";
import {
  formatXdai,
  humanWxhopr,
  MIN_DISPLAYABLE_XDAI_WEI,
  wxhoprDecimal,
} from "../utils/hopli.ts";
import FundingAddress from "./address/FundingAddress.tsx";
import Button from "./common/Button.tsx";
import { Modal } from "./common/Modal.tsx";

export default function AddFundsModal(props: {
  open: boolean;
  onClose: () => void;
  nodeAddress: string;
  wxhoprDeficit?: bigint | null;
  xdaiDeficit?: bigint | null;
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
            You can transfer <span class="font-bold">xDAI</span> or{" "}
            <span class="font-bold">wxHOPR</span> on{" "}
            <span class="font-bold">Gnosis Chain</span>.
          </div>
          <Show when={props.wxhoprDeficit || props.xdaiDeficit}>
            <div class="text-sm text-text-secondary">
              <span class="font-medium">Recommended to send:</span>
              <Show when={props.wxhoprDeficit}>
                {(deficit) => (
                  <div class="font-mono">
                    +{humanWxhopr(deficit())}{" "}
                    (<span class="select-text cursor-text">
                      {wxhoprDecimal(deficit())}
                    </span>{" "}
                    wxHOPR)
                  </div>
                )}
              </Show>
              <Show when={props.xdaiDeficit}>
                {(deficit) => {
                  const displayDeficit = deficit() < MIN_DISPLAYABLE_XDAI_WEI
                    ? MIN_DISPLAYABLE_XDAI_WEI
                    : deficit();
                  return (
                    <div class="font-mono">
                      +{formatXdai(displayDeficit)} xDAI
                    </div>
                  );
                }}
              </Show>
            </div>
          </Show>
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
