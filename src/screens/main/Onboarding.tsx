import { createSignal, onCleanup, onMount } from "solid-js";
import Start from "@src/components/onboarding/Start";
import Airdrop from "@src/components/onboarding/Airdrop";
import { Dynamic } from "solid-js/web";
import Manually from "@src/components/onboarding/Manually";
import { listen } from "@tauri-apps/api/event";
import Synchronization from "@src/screens/main/Synchronization";
import StatusIndicator from "@src/components/StatusIndicator";

const steps = {
  start: Start,
  airdrop: Airdrop,
  manually: Manually,
  synchronization: Synchronization,
};

export default function Onboarding() {
  const [step, setStep] = createSignal<"start" | "airdrop" | "manually">(
    "start",
  );
  let unlistenSetStep: (() => void) | undefined;

  onMount(() => {
    void (async () => {
      unlistenSetStep = await listen<"start" | "airdrop" | "manually">(
        "onboarding:set-step",
        ({ payload }) => {
          setStep(payload);
        },
      );
    })();
  });

  onCleanup(() => {
    if (unlistenSetStep) unlistenSetStep();
  });

  return (
    <div class="h-screen bg-gray-100 flex flex-col items-center justify-between">
      <Dynamic component={steps[step()]} setStep={setStep} />
      <StatusIndicator size="sm" />
    </div>
  );
}
