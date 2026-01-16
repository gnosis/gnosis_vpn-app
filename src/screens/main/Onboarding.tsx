import { createSignal, onCleanup, onMount } from "solid-js";
import Start from "../../components/onboarding/Start.tsx";
import { Dynamic } from "solid-js/web";
import Manually from "../../components/onboarding/Manually.tsx";
import { listen } from "@tauri-apps/api/event";
import StatusIndicator from "../../components/StatusIndicator.tsx";

const steps = {
  start: Start,
  manually: Manually,
};

export default function Onboarding() {
  const [step, setStep] = createSignal<"start" | "manually">("start");
  let unlistenSetStep: (() => void) | undefined;

  onMount(() => {
    void (async () => {
      unlistenSetStep = await listen<"start" | "manually">(
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
