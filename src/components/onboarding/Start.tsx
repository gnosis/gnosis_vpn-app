import gnosisVpnLogo from "@assets/img/gnosis-vpn.svg";
import Button from "../common/Button.tsx";
import { useAppStore } from "../../stores/appStore.ts";

export default function Start(
  { setStep }: { setStep: (step: string) => void },
) {
  const [appState] = useAppStore();

  return (
    <div class="h-full w-full flex flex-col items-center justify-between p-6 pb-0">
      <img src={gnosisVpnLogo} alt="Gnosis VPN" class="w-full mt-6" />
      <div class="text-4xl font-bold">(MVP)</div>
      <div class="w-full flex flex-col gap-2">
        <Button
          size="lg"
          onClick={() => setStep("manually")}
          disabled={appState.vpnStatus === "ServiceUnavailable"}
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}
