import parachute from "@assets/img/parachute.png";
import Button from "@src/components/common/Button";
import { createSignal, Show } from "solid-js";
import { useLogsStore } from "@src/stores/logsStore";
import checkIcon from "@assets/icons/checked-box-filled.svg";
import { useAppStore } from "@src/stores/appStore";

export default function Airdrop(
  { setStep }: { setStep: (step: string) => void },
) {
  const [secretCode, setSecretCode] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [claimed, setClaimed] = createSignal(false);
  const [, logActions] = useLogsStore();
  const [, appActions] = useAppStore();

  const handleClaim = async () => {
    try {
      setLoading(true);
      // claim airdrop
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setClaimed(true);
    } catch (error) {
      logActions.append(`Error claiming airdrop: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="h-full w-full flex flex-col items-center p-6">
      <h1 class="text-2xl font-bold text-center my-6">Before we connect</h1>
      <div class="flex flex-col items-center gap-2 w-full flex-grow">
        <img src={parachute} alt="Parachute" class="w-1/3 mb-8" />
        <div class="w-full text-left">
          If you’re a tester, claim wxHOPR and xDAI
        </div>
        <label class="flex flex-col gap-1 w-full">
          <span class="text-sm font-bold">Secret code</span>
          <input
            type="text"
            class="rounded-xl border border-gray-700 p-2 w-full focus:outline-none"
            value={secretCode()}
            onInput={(e) => setSecretCode(e.currentTarget.value)}
            disabled={claimed()}
            placeholder="Enter secret code"
          />
        </label>

        <Show when={!claimed()}>
          <Button
            size="lg"
            onClick={handleClaim}
            disabled={secretCode().length === 0}
            loading={loading()}
          >
            {loading() ? "Claiming..." : "Claim"}
          </Button>
        </Show>

        <Show when={claimed()}>
          <div class="flex flex-row w-full items-center fade-in-up">
            <div class="flex flex-row">
              <img src={checkIcon} alt="Check" class="h-5 w-5 mr-4" />
              <div class="text-sm">Airdrop received. You can proceed.</div>
            </div>
          </div>
        </Show>
      </div>

      <Show when={!claimed()}>
        <Button size="lg" variant="outline" onClick={() => setStep("complete")}>
          Skip
        </Button>
      </Show>
      <Show when={claimed()}>
        <Button size="lg" onClick={() => appActions.setScreen("main")}>
          Proceed
        </Button>
      </Show>
    </div>
  );
}
