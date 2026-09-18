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
    <div class="relative h-full w-full flex flex-col items-center p-6">
      {/* Logo geometry mirrors the splash in index.html and the initialization screen. */}
      <div class="absolute inset-x-0 top-[var(--golden-logo-y)] -translate-y-1/2 px-6">
        <GnosisVpnLogo class="w-full text-text-primary" />
      </div>
      <div class="mt-auto w-full flex flex-col gap-2">
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
