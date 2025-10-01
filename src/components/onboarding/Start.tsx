import gnosisVpnLogo from "../../assets/img/gnosis-vpn.svg";
import Button from "../common/Button";
import WarningIcon from "../common/WarningIcon";

export default function Start({ setStep }: { setStep: (step: string) => void }) {
  return <div class="h-full w-full flex flex-col items-center justify-between p-6">
    <img src={gnosisVpnLogo} alt="Gnosis VPN" class="w-full mt-6" />
    <div class="text-4xl font-bold">(MVP)</div>
    <div class="w-full flex flex-col gap-2">
      <div class="text-sm text-center">
        <WarningIcon />
        Early release disclaimer here.
      </div>
      <Button size="lg" onClick={() => setStep("airdrop")}>Get Started</Button>
    </div>
  </div>;
}