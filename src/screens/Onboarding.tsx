import { createSignal } from "solid-js";
import Start from "@src/components/onboarding/Start";
import Airdrop from "@src/components/onboarding/Airdrop";
import { Dynamic } from "solid-js/web";
import Complete from "@src/components/onboarding/Complete";
import { useAppStore } from "@src/stores/appStore";

const steps = {
  start: Start,
  airdrop: Airdrop,
  complete: Complete,
};

export default function Onboarding() {
  const [step, setStep] = createSignal<"start" | "airdrop" | "complete">(
    "start",
  );

  const [appState, appActions] = useAppStore();
  console.log("appState", appState);

  return (
    <div class="h-screen bg-gray-100">
      <Dynamic component={steps[step()]} setStep={setStep} />
    </div>
  );
}
