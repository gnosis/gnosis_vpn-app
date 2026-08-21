import { Show } from "solid-js";
import { formatWxhopr, formatXdai, wxhoprDecimal } from "../utils/hopli.ts";
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
  // The recommendation block makes the modal tall enough to push the title
  // out of view, so trade the roomy spacing for a tight one only then.
  const hasRecommendation = () =>
    Boolean(props.wxhoprDeficit || props.xdaiDeficit);

  // The exact value in parentheses is only worth showing when the rounded
  // display doesn't already spell it out verbatim.
  const wxhoprExact = (deficit: bigint): string | null => {
    const exact = wxhoprDecimal(deficit);
    return formatWxhopr(deficit, 3, "ceil") === exact ? null : exact;
  };
  const xdaiExact = (deficit: bigint): string | null => {
    const exact = formatXdai(deficit, 18);
    return formatXdai(deficit, 3, "ceil") === exact ? null : exact;
  };

  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div class={`flex flex-col ${hasRecommendation() ? "gap-2" : "gap-8"}`}>
        <div class="text-base font-semibold">Add funds</div>
        <div
          class={`flex flex-col ${
            hasRecommendation() ? "gap-2" : "gap-4 my-2"
          }`}
        >
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
                    +{formatWxhopr(deficit(), 3, "ceil")} wxHOPR
                    <Show when={wxhoprExact(deficit())}>
                      {(exact) => (
                        <>
                          {" "}
                          (<span class="select-text cursor-text">
                            {exact()}
                          </span>{" "}
                          wxHOPR)
                        </>
                      )}
                    </Show>
                  </div>
                )}
              </Show>
              <Show when={props.xdaiDeficit}>
                {(deficit) => (
                  <div class="font-mono">
                    +{formatXdai(deficit(), 3, "ceil")} xDAI
                    <Show when={xdaiExact(deficit())}>
                      {(exact) => (
                        <>
                          {" "}
                          (<span class="select-text cursor-text">
                            {exact()}
                          </span>{" "}
                          xDAI)
                        </>
                      )}
                    </Show>
                  </div>
                )}
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
