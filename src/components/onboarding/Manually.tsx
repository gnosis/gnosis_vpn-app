import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import { useAppStore } from "../../stores/appStore.ts";
import checkIcon from "@assets/icons/checked-box-filled.svg";
import iconNumber1 from "@assets/icons/1.svg";
import iconNumber2 from "@assets/icons/2.svg";
import loadingIcon from "@assets/icons/loading.svg";
import {
  getPreparingSafeNodeAddress,
  isWxHOPRTransferred,
  isXDAITransferred,
} from "@src/utils/status.ts";
import FundingAddress from "../address/FundingAddress.tsx";
import StatusIndicator from "../status/StatusIndicator.tsx";

export default function Manually() {
  const [appState] = useAppStore();
  const wxhoprTransferred = () => isWxHOPRTransferred(appState);
  const xdaiTransferred = () => isXDAITransferred(appState);

  const ready = () => wxhoprTransferred() && xdaiTransferred();

  const [readyDelayed, setReadyDelayed] = createSignal(false);
  createEffect(() => {
    if (ready()) {
      const timeout = setTimeout(() => setReadyDelayed(true), 400);
      onCleanup(() => clearTimeout(timeout));
    } else {
      setReadyDelayed(false);
    }
  });
  const isServiceAvailable = () => appState.vpnStatus !== "ServiceUnavailable";

  const nodeAddress = createMemo(() => {
    return getPreparingSafeNodeAddress(appState);
  });

  return (
    <div class="h-full w-full flex flex-col items-stretch p-6 pb-0 gap-4 select-none">
      <h1 class="w-full text-3xl font-bold text-center mt-6 mb-3 flex flex-row">
        Fund your VPN
      </h1>
      <FundingAddress
        full
        address={nodeAddress()}
        qrVisible
      />
      <div
        class={`flex flex-col gap-4 grow ${
          !isServiceAvailable() ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <div class="flex flex-row w-full">
          <img
            src={wxhoprTransferred() ? checkIcon : iconNumber1}
            alt={wxhoprTransferred() ? "Checked" : "1"}
            class={`h-5 w-5 mr-4 mt-1 dark:invert ${
              wxhoprTransferred() ? "check-pop" : ""
            }`}
          />
          <div class="flex flex-col">
            <div class="font-bold">Transfer wxHOPR (Gnosis Chain)</div>
            <div class="text-sm text-text-secondary">1 GB is 110 wxHOPR.</div>
          </div>
        </div>

        <div class="flex flex-row w-full">
          <img
            src={xdaiTransferred() ? checkIcon : iconNumber2}
            alt={xdaiTransferred() ? "Checked" : "2"}
            class={`h-5 w-5 mr-4 mt-1 dark:invert ${
              xdaiTransferred() ? "check-pop" : ""
            }`}
          />
          <div class="flex flex-col">
            <div class="font-bold">Transfer xDAI (Gnosis Chain)</div>
            <div class="text-sm text-text-secondary">
              1 xDAI is enough for one year<br />switching exit nodes.
            </div>
          </div>
        </div>
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
            <Show when={!xdaiTransferred() && !wxhoprTransferred()}>
              <div class="flex flex-col text-sm fade-in-up">
                Waiting for incoming funds…
              </div>
            </Show>
            <Show when={xdaiTransferred() && !wxhoprTransferred()}>
              <div class="flex flex-col text-sm fade-in-up">
                xDAI arrived, waiting for wxHOPR
              </div>
            </Show>
            <Show when={!xdaiTransferred() && wxhoprTransferred()}>
              <div class="flex flex-col text-sm fade-in-up">
                wxHOPR arrived, waiting for xDAI
              </div>
            </Show>
          </div>
        </Show>

        <Show when={readyDelayed()}>
          <div class="flex flex-row w-full items-center gap-4 fade-in-up h-15">
            <img
              src={checkIcon}
              alt="Check"
              class="h-5 w-5 dark:invert check-pop"
            />
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
