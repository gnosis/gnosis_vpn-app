import parachute from "@assets/img/parachute.png";
import Button from "@src/components/common/Button";
import { createMemo, createSignal, Show } from "solid-js";
import { useLogsStore } from "@src/stores/logsStore";
import checkIcon from "@assets/icons/checked-box-filled.svg";
import { useAppStore } from "@src/stores/appStore";
import backIcon from "@assets/icons/arrow-left.svg";
import Spinner from "@src/components/common/Spinner";

export default function Airdrop(
  { setStep }: { setStep: (step: string) => void },
) {
  const [secretCode, setSecretCode] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [claimed, setClaimed] = createSignal(false);
  const [, logActions] = useLogsStore();
  const [appState, appActions] = useAppStore();

  const fundingTool = createMemo(() => {
    const rm = appState.runMode;
    return rm && typeof rm === "object" && "PreparingSafe" in rm
      ? rm.PreparingSafe.funding_tool
      : undefined;
  });

  const handleClaim = async () => {
    try {
      setLoading(true);
      // claim airdrop
      // await new Promise((resolve) => setTimeout(resolve, 1500));
      await appActions.claimAirdrop(secretCode());
      setClaimed(true);
    } catch (error) {
      logActions.append(`Error claiming airdrop: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputSecretCode = (e: Event) => {
    setSecretCode((e.currentTarget as HTMLInputElement).value);
    setClaimed(false);
  };

  const handleRefresh = () => {
    setClaimed(false);
    setSecretCode("");
  };

  return (
    <div class="h-full w-full flex flex-col items-center p-6 pb-0 gap-2">
      <h1 class="w-full text-2xl font-bold text-center my-6 flex flex-row">
        <button
          type="button"
          class="text-sm text-gray-500 hover:cursor-pointer"
          onClick={() => setStep("start")}
        >
          <img src={backIcon} alt="Back" class="h-4 w-4 mr-4" />
        </button>
        Before we connect
      </h1>
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
            onInput={handleInputSecretCode}
            onKeyDown={(e) => {
              if ((e as KeyboardEvent).key === "Enter") {
                e.preventDefault();
                const canClaim = secretCode().length > 0 && !loading() &&
                  !claimed() && fundingTool() !== "CompletedSuccess";
                if (canClaim) {
                  void handleClaim();
                }
              }
            }}
            placeholder="Enter secret code"
          />
        </label>

        <Show when={!claimed() && fundingTool() !== "CompletedSuccess"}>
          <Button
            size="lg"
            onClick={handleClaim}
            disabled={secretCode().length === 0}
            loading={loading()}
          >
            {loading() ? "Claiming..." : "Claim"}
          </Button>
        </Show>
        <Show when={fundingTool() === "CompletedError" && claimed()}>
          <Button size="lg" onClick={handleRefresh}>
            Retry
          </Button>
          <div class="text-red-500 text-sm">
            Funding failed. Please try again.
          </div>
        </Show>

        <Show when={fundingTool() === "InProgress"}>
          <div class="flex flex-row w-full items-center fade-in-up">
            <div class="flex flex-row">
              <div class="w-5 h-5 mr-4">
                <Spinner />
              </div>
              <div class="text-sm">
                Verifying... This can take up to two minutes
              </div>
            </div>
          </div>
        </Show>

        <Show when={fundingTool() === "CompletedSuccess"}>
          <div class="flex flex-row w-full items-center fade-in-up">
            <div class="flex flex-row">
              <img src={checkIcon} alt="Check" class="h-5 w-5 mr-4" />
              <div class="text-sm">
                Airdrop claimed, wait for synchronization to complete
              </div>
            </div>
          </div>
        </Show>
      </div>
      <Show when={fundingTool() !== "CompletedSuccess"}>
        <Button size="lg" variant="outline" onClick={() => setStep("manually")}>
          Skip
        </Button>
      </Show>
    </div>
  );
}
