import { createSignal } from "solid-js";
import Fund from "@src/components/onboarding/Fund.tsx";
import {
  openFundingSite,
  useFunding,
} from "@src/screens/settings/useFunding.ts";
import { useAppStore } from "@src/stores/appStore.ts";

export default function Onboarding() {
  const [appState] = useAppStore();
  const funding = useFunding();
  const [paymentStarted, setPaymentStarted] = createSignal(false);

  const disabled = () =>
    !funding.nodeAddress() ||
    appState.vpnStatus === "ServiceUnavailable" ||
    appState.vpnStatus === "InUseByOtherUser";

  return (
    <div class="h-screen bg-bg-primary">
      <Fund
        disabled={disabled()}
        waiting={paymentStarted()}
        address={funding.nodeAddress()}
        onOpenFundingSite={() => {
          setPaymentStarted(true);
          void openFundingSite(funding.nodeAddress());
        }}
      />
    </div>
  );
}
