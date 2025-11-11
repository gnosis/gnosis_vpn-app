import { createSignal, Show } from "solid-js";
import { useAppStore } from "@src/stores/appStore";
import Button from "@src/components/common/Button";
import Checkbox from "@src/components/common/Checkbox";
// import FundingAddress from "@src/components/FundingAddress";
import Help from "@src/components/Help";
import { useLogsStore } from "@src/stores/logsStore";
import checkIcon from "@assets/icons/checked-box-filled.svg";
import { isPreparingSafe, isWxHOPRTransferred, isXDAITransferred } from "@src/utils/status.ts";
import backIcon from "@assets/icons/arrow-left.svg";
import FundingAddress from "@src/components/FundingAddress";

export default function Manually({ setStep }: { setStep: (step: string) => void }) {
  const [appState, appActions] = useAppStore();
  const [, logActions] = useLogsStore();
  const wxhoprTransferred = () => isWxHOPRTransferred(appState);
  const xdaiTransferred = () => isXDAITransferred(appState);
  const [ready, setReady] = createSignal(false);
  const [loading, setLoading] = createSignal(false);

  const getButtonLabel = () => {
    if (loading()) return "Checking...";
    if (wxhoprTransferred() && xdaiTransferred() && ready()) return "Proceed";
    return "Confirm";
  };

  console.log("appState", appState);

  const handleClick = async () => {
    if (!ready()) {
      try {
        setLoading(true);
        // check if it's ready
        // simulate readiness check delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        setReady(true);
      } catch (error) {
        logActions.append(`Error checking if node is funded: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    } else {
      appActions.setScreen("synchronization");
    }
  };

  return (
    <div class="h-full w-full flex flex-col items-stretch p-6 gap-4">
      <h1 class="w-full text-2xl font-bold text-center my-6 flex flex-row">
        <button type="button" class="text-sm text-gray-500 hover:cursor-pointer" onClick={() => setStep("airdrop")}>
          <img src={backIcon} alt="Back" class="h-4 w-4 mr-4" />
        </button>
        Before we connect
      </h1>
      <div class="flex flex-col gap-4 grow">
        <label class="flex flex-row w-full hover:cursor-pointer">
          <div class="pr-4 pt-1">
            <Checkbox checked={wxhoprTransferred()} onChange={() => {}} disabled />
          </div>
          <div class="flex flex-col">
            <div class="font-bold">1. Transfer wxHOPR (Gnosis Chain)</div>
            <div class="text-sm text-gray-500">1 GB is X USDC.</div>
          </div>
        </label>

        <label class="flex flex-row w-full hover:cursor-pointer">
          <div class="pr-4 pt-1">
            <Checkbox checked={xdaiTransferred()} onChange={() => {}} disabled />
          </div>
          <div class="flex flex-col">
            <div class="font-bold">2. Transfer xDAI (Gnosis Chain)</div>
            <div class="text-sm text-gray-500">1xDAI is enough for one year switching exit nodes.</div>
          </div>
        </label>

        <FundingAddress
          address={isPreparingSafe(appState) ? (appState.runMode?.PreparingSafe?.node_address ?? "") : ""}
        />
        <div class="text-sm text-gray-500">
          After the tx has been made, it can take up to two minutes, until your App can connect.
        </div>

        <Show when={ready()}>
          <div class="flex flex-row w-full h-full items-center fade-in-up">
            <div class="flex flex-row">
              <img src={checkIcon} alt="Check" class="h-5 w-5 mr-4 mt-1" />
              <div class="text-sm">All necessary funds have been received successfully. You can proceed.</div>
            </div>
          </div>
        </Show>
      </div>

      <Help />
      <Button onClick={handleClick} disabled={!wxhoprTransferred() || !xdaiTransferred()} loading={loading()}>
        {getButtonLabel()}
      </Button>
    </div>
  );
}
