import { createSignal } from "solid-js";
import { useAppStore } from "@src/stores/appStore";
import Button from "@src/components/common/Button";
import Checkbox from "@src/components/common/Checkbox";
import FundingAddress from "@src/components/FundingAddress";
import Help from "@src/components/Help";

export default function Complete() {
  const [, appActions] = useAppStore();
  const [step1, setStep1] = createSignal(false);
  const [step2, setStep2] = createSignal(false);

  return (
    <div class="h-full w-full flex flex-col items-stretch p-6 gap-4">
      <h1 class="text-2xl font-bold text-center my-6">Before we connect</h1>
      <div class="flex flex-col gap-4 flex-grow">
        <label class="flex flex-row w-full hover:cursor-pointer">
          <div class="pr-4 pt-1">
            <Checkbox checked={step1()} onChange={setStep1} />
          </div>
          <div class="flex flex-col">
            <div class="font-bold">1. Transfer wxHOPR (Gnosis Chain)</div>
            <div class="text-sm text-gray-500">1 GB is X USDC. </div>
          </div>
        </label>

        <label class="flex flex-row w-full hover:cursor-pointer">
          <div class="pr-4 pt-1">
            <Checkbox checked={step2()} onChange={setStep2} />
          </div>
          <div class="flex flex-col">
            <div class="font-bold">2. Transfer xDAI (Gnosis Chain)</div>
            <div class="text-sm text-gray-500">1xDAI is enough for one year switching exit nodes. </div>
          </div>
        </label>

        <FundingAddress address="0x1234567890123456789012345678901234567890" />
        <div class="text-sm text-gray-500">
          After the tx has been made, it can take up to two minutes, until your App can connect. In the case it will
          auto-forward to the next step.
        </div>
      </div>

      <Help />
      <Button onClick={() => appActions.setScreen("main")} disabled={!step1() || !step2()}>
        Confirm
      </Button>
    </div>
  );
}
