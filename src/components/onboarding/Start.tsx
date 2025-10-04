import { Show } from "solid-js";
import gnosisVpnLogo from "@assets/img/gnosis-vpn.svg";
import Button from "@src/components/common/Button";
import WarningIcon from "@src/components/common/WarningIcon";
import { useAppStore } from "@src/stores/appStore";
import { isServiceUnavailable } from "@src/utils/status";
import StatusIndicator from "@src/components/StatusIndicator";

export default function Start(
  { setStep }: { setStep: (step: string) => void },
) {
  const [appState] = useAppStore();

  return (
    <div class="h-full w-full flex flex-col items-center justify-between p-6">
      <img src={gnosisVpnLogo} alt="Gnosis VPN" class="w-full mt-6" />
      <div class="text-4xl font-bold">(MVP)</div>
      <div class="w-full flex flex-col gap-2">
        <div class="w-full flex flex-col items-center my-4 h-10">
          <Show when={isServiceUnavailable(appState.connectionStatus)}>
            <StatusIndicator />
          </Show>
        </div>
        <div class="text-sm text-center">
          <WarningIcon />
          Early release disclaimer here.
        </div>
        <Button
          size="lg"
          onClick={() => setStep("airdrop")}
          disabled={isServiceUnavailable(appState.connectionStatus)}
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}
