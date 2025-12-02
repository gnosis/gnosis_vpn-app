import { createMemo, createSignal, Show } from "solid-js";
import { useAppStore } from "@src/stores/appStore";
import Button from "@src/components/common/Button";
import Checkbox from "@src/components/common/Checkbox";
import Help from "@src/components/Help";
import { useLogsStore } from "@src/stores/logsStore";
import checkIcon from "@assets/icons/checked-box-filled.svg";
import {
  getPreparingSafeNodeAddress,
  isWxHOPRTransferred,
  isXDAITransferred,
} from "@src/utils/status.ts";
import FundingAddress from "@src/components/FundingAddress";
import Spinner from "@src/components/common/Spinner";

export default function Manually() {
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

  const nodeAddress = createMemo(() => {
    return getPreparingSafeNodeAddress(appState);
  });

  const handleClick = () => {
    if (!ready()) {
      try {
        setLoading(true);
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
        Before we connect...
      </h1>
      <div class="flex flex-col gap-4 grow">
        <label class="flex flex-row w-full hover:cursor-pointer">
          <div class="pr-4 pt-1">
            <Checkbox
              checked={wxhoprTransferred()}
              onChange={() => {}}
              disabled
            />
          </div>
          <div class="flex flex-col">
            <div class="font-bold">1. Transfer wxHOPR (Gnosis Chain)</div>
            <div class="text-sm text-gray-500">1 GB is X USDC.</div>
          </div>
        </label>

        <label class="flex flex-row w-full hover:cursor-pointer">
          <div class="pr-4 pt-1">
            <Checkbox
              checked={xdaiTransferred()}
              onChange={() => {}}
              disabled
            />
          </div>
          <div class="flex flex-col">
            <div class="font-bold">2. Transfer xDAI (Gnosis Chain)</div>
            <div class="text-sm text-gray-500">
              1 xDAI is enough for one year switching exit nodes.
            </div>
          </div>
        </label>

        <FundingAddress address={nodeAddress()} />
        <div class="text-sm text-gray-500">
          After the tx has been made, it can take up to two minutes, until your
          App can connect. In the case it will auto-forward to the next step.
        </div>

        <Show when={!xdaiTransferred() && !wxhoprTransferred()}>
          <div class="flex flex-row w-full h-full items-center fade-in-up">
            <div class="flex flex-row">
              <Spinner />
              <div class="text-sm">Checking...</div>
            </div>
          </div>
        </Show>
        <Show when={xdaiTransferred() && !wxhoprTransferred()}>
          <div class="flex flex-row w-full h-full items-center fade-in-up">
            <div class="flex flex-row">
              <Spinner />
              <div class="text-sm">xDAI received, checking for wxHOPR...</div>
            </div>
          </div>
        </Show>
        <Show when={!xdaiTransferred() && wxhoprTransferred()}>
          <div class="flex flex-row w-full h-full items-center fade-in-up">
            <div class="flex flex-row">
              <Spinner />
              <div class="text-sm">wxHOPR received, checking for xDAI...</div>
            </div>
          </div>
        </Show>

        <Show when={ready()}>
          <div class="flex flex-row w-full h-full items-center fade-in-up">
            <div class="flex flex-row">
              <img src={checkIcon} alt="Check" class="h-5 w-5 mr-4 mt-1" />
              <div class="text-sm">
                All necessary funds have been received successfully. You can
                proceed.
              </div>
            </div>
          </div>
        </Show>
      </div>

      <Help />
      <Button
        onClick={handleClick}
        disabled={!wxhoprTransferred() || !xdaiTransferred()}
        loading={loading()}
      >
        {getButtonLabel()}
      </Button>
    </div>
  );
}
