import { createSignal, onCleanup, onMount } from "solid-js";
import Start from "@src/components/onboarding/Start";
import Airdrop from "@src/components/onboarding/Airdrop";
import { Dynamic } from "solid-js/web";
import Complete from "@src/components/onboarding/Complete";
import { listen } from "@tauri-apps/api/event";

const steps = {
  start: Start,
  airdrop: Airdrop,
  complete: Complete,
};

export default function Onboarding() {
  const [step, setStep] = createSignal<"start" | "airdrop" | "complete">("start");
  let unlistenSetStep: (() => void) | undefined;

  onMount(() => {
    void (async () => {
      unlistenSetStep = await listen<"start" | "airdrop" | "complete">("onboarding:set-step", ({ payload }) => {
        setStep(payload);
      });
    })();
  });

  onCleanup(() => {
    if (unlistenSetStep) unlistenSetStep();
  });

  return (
    <div class="h-screen bg-gray-100">
      <Dynamic component={steps[step()]} setStep={setStep} />
    </div>
  );
}
