import Button from "../common/Button.tsx";
import GnosisVpnLogo from "../common/GnosisVpnLogo.tsx";
import { useAppStore } from "../../stores/appStore.ts";

export default function Start(
  { setStep }: { setStep: (step: string) => void },
) {
  const [appState] = useAppStore();

  const isServiceUnavailable = () =>
    appState.vpnStatus === "ServiceUnavailable";

  return (
    <div class="h-full w-full flex flex-col items-center p-6 pb-0">
      <GnosisVpnLogo class="w-full mt-6 text-text-primary" />
      <div class="text-4xl font-bold mt-40">El Dorado</div>
      <div class="grow" />
      <div class="w-full flex flex-col gap-2">
        <Button
          size="lg"
          onClick={() => setStep("manually")}
          disabled={isServiceUnavailable()}
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}
