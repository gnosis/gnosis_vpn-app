import { createMemo, Show } from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import checkIcon from "@assets/icons/checked-box.svg";
import icon1 from "@assets/icons/1.svg";
import icon2 from "@assets/icons/2.svg";
import loadingIcon from "@assets/icons/loading.svg";
import {
  getPreparingSafeNodeAddress,
  isWxHOPRTransferred,
  isXDAITransferred,
} from "@src/utils/status.ts";
import FundingAddress from "../FundingAddress.tsx";
import StatusIndicator from "../StatusIndicator.tsx";

export default function Manually() {
  const [appState] = useAppStore();
  const wxhoprTransferred = () => isWxHOPRTransferred(appState);
  const xdaiTransferred = () => isXDAITransferred(appState);
  const ready = () => wxhoprTransferred() && xdaiTransferred();
  const isServiceAvailable = () => appState.vpnStatus !== "ServiceUnavailable";

  const nodeAddress = createMemo(() => {
    return getPreparingSafeNodeAddress(appState);
  });

  return (
    <div class="h-full w-full flex flex-col items-stretch p-6 pb-0 gap-4 select-none">
      <h1 class="w-full text-2xl font-bold text-center my-6 flex flex-row">
        Before we connect...
      </h1>
      <div
        class={`flex flex-col gap-4 grow ${
          !isServiceAvailable() ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <div class="flex flex-row w-full">
          <img
            src={wxhoprTransferred() ? checkIcon : icon1}
            alt={wxhoprTransferred() ? "Checked" : "1"}
            class="h-5 w-5 mr-4 mt-1 dark:invert"
          />
          <div class="flex flex-col">
            <div class="font-bold">Transfer wxHOPR (Gnosis Chain)</div>
            <div class="text-sm text-text-secondary">1GB is 110 wxHOPR</div>
          </div>
        </div>

        <div class="flex flex-row w-full">
          <img
            src={xdaiTransferred() ? checkIcon : icon2}
            alt={xdaiTransferred() ? "Checked" : "2"}
            class="h-5 w-5 mr-4 mt-1 dark:invert"
          />
          <div class="flex flex-col">
            <div class="font-bold">Transfer xDAI (Gnosis Chain)</div>
            <div class="text-sm text-text-secondary">
              1 xDAI is enough for one year switching exit nodes.
            </div>
          </div>
        </div>

        <FundingAddress address={nodeAddress()} />
      </div>

      <Show
        when={isServiceAvailable()}
        fallback={
          <div class="flex flex-row w-full justify-center fade-in-up">
            <StatusIndicator size="sm" whenOfflineOnly />
          </div>
        }
      >
        <Show when={!wxhoprTransferred() || !xdaiTransferred()}>
          <div class="flex flex-row w-full items-center gap-4 fade-in-up h-15 shrink-0">
            <div class="h-5 w-5 dark:invert">
              <img src={loadingIcon} alt="Loading" class="h-5 w-5" />
            </div>
            <div class="flex flex-col text-sm">
              {!xdaiTransferred() && !wxhoprTransferred()
                ? "Waiting for incoming funds…"
                : xdaiTransferred()
                ? "xDAI arrived, waiting for wxHOPR"
                : "wxHOPR arrived, waiting for xDAI"}
            </div>
          </div>
        </Show>

        <Show when={ready()}>
          <div class="flex flex-row w-full items-center gap-4 fade-in-up h-15">
            <img src={checkIcon} alt="Check" class="h-5 w-5 dark:invert" />
            <div class="text-sm">
              All necessary funds have been transferred. You'll be forwarded in
              a moment.
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
