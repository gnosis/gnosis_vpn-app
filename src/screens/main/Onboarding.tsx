import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import Fund from "@src/components/onboarding/Fund.tsx";
import SendFundsPage from "@src/screens/settings/SendFundsPage.tsx";
import {
  openFundingSite,
  useFunding,
} from "@src/screens/settings/useFunding.ts";
import { useAppStore } from "@src/stores/appStore.ts";

export type OnboardingStep = "fund" | "send-funds";

export default function Onboarding() {
  const [appState] = useAppStore();
  const funding = useFunding();
  const [step, setStep] = createSignal<OnboardingStep>("fund");
  const [paymentStarted, setPaymentStarted] = createSignal(false);
  let unlistenSetStep: (() => void) | undefined;
  let disposed = false;

  onMount(() => {
    listen<OnboardingStep>(
      "onboarding:set-step",
      ({ payload }) => {
        if (!disposed) setStep(payload);
      },
    ).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenSetStep = unlisten;
    });
  });

  onCleanup(() => {
    disposed = true;
    unlistenSetStep?.();
  });

  const disabled = () =>
    !funding.nodeAddress() ||
    appState.vpnStatus === "ServiceUnavailable" ||
    appState.vpnStatus === "InUseByOtherUser";

  return (
    <div class="h-screen bg-bg-primary">
      <Fund
        disabled={disabled()}
        waiting={paymentStarted()}
        onSendFunds={() => {
          setPaymentStarted(true);
          setStep("send-funds");
        }}
        onOpenFundingSite={() => {
          setPaymentStarted(true);
          void openFundingSite(funding.nodeAddress());
        }}
      />
      <Show when={step() === "send-funds"}>
        <SendFundsPage onBack={() => setStep("fund")} />
      </Show>
    </div>
  );
}
