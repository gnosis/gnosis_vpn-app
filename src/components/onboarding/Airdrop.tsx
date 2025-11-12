import parachute from "@assets/img/parachute.png";
import Button from "@src/components/common/Button";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { useLogsStore } from "@src/stores/logsStore";
import checkIcon from "@assets/icons/checked-box-filled.svg";
import { useAppStore } from "@src/stores/appStore";
import backIcon from "@assets/icons/arrow-left.svg";
import Spinner from "@src/components/common/Spinner";
import { isPreparingSafe } from "@src/utils/status";

export default function Airdrop(
  { setStep }: { setStep: (step: string) => void },
) {
  const [secretCode, setSecretCode] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [claimed, setClaimed] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();
  const [pendingClaimState, setPendingClaimState] = createSignal<
    string | undefined
  >();
  const [previousToolState, setPreviousToolState] = createSignal<
    string | undefined
  >();
  const [hasSeenStateUpdate, setHasSeenStateUpdate] = createSignal(false);

  const [, logActions] = useLogsStore();
  const [appState, appActions] = useAppStore();

  const fundingTool = createMemo(() => {
    const rm = appState.runMode;
    return rm && typeof rm === "object" && "PreparingSafe" in rm
      ? rm.PreparingSafe.funding_tool
      : undefined;
  });

  const nodeAddress = createMemo(() => {
    if (isPreparingSafe(appState)) {
      const address = appState.runMode.PreparingSafe.node_address;
      return address && address !== "unknown" ? address : undefined;
    }
    return undefined;
  });

  const isServiceRunning = createMemo(() => {
    return appState.vpnStatus !== "ServiceUnavailable";
  });

  const isDisabled = createMemo(() => {
    return !isServiceRunning() || nodeAddress() === undefined;
  });

  const handleInputSecretCode = (e: Event) => {
    const newValue = (e.currentTarget as HTMLInputElement).value;
    setSecretCode(newValue);
    if (claimed() && fundingTool() === "CompletedError") {
      setClaimed(false);
      setError(undefined);
      setPendingClaimState(undefined);
      setPreviousToolState(undefined);
      setHasSeenStateUpdate(false);
    }
  };

  const claimAirdrop = async () => {
    try {
      setLoading(true);
      setError(undefined);
      setClaimed(true);
      const currentTool = fundingTool();
      setPendingClaimState(currentTool);
      setPreviousToolState(currentTool);
      setHasSeenStateUpdate(false);
      await appActions.claimAirdrop(secretCode());
    } catch (error) {
      logActions.append(`Error claiming airdrop: ${String(error)}`);
      setError("Funding failed. Please try again.");
      setLoading(false);
      setPendingClaimState(undefined);
      setPreviousToolState(undefined);
      setHasSeenStateUpdate(false);
    }
  };

  const handleClaim = async () => {
    await claimAirdrop();
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(undefined);
    setClaimed(true);
    const currentTool = fundingTool();
    setPendingClaimState(currentTool);
    setPreviousToolState(currentTool);
    setHasSeenStateUpdate(false);
    await claimAirdrop();
  };

  createEffect(() => {
    const tool = fundingTool();
    const isClaimed = claimed();
    const pendingState = pendingClaimState();
    const prevState = previousToolState();
    const seenUpdate = hasSeenStateUpdate();

    if (!isClaimed) {
      return;
    }

    if (pendingState !== undefined && tool !== pendingState) {
      setHasSeenStateUpdate(true);
    }
    if (prevState !== undefined && tool !== prevState) {
      setHasSeenStateUpdate(true);
    }

    if (tool === "CompletedError") {
      // Determine if this is a new error:
      // 1. If previous state was InProgress, this is definitely a new error (we went through the process)
      // 2. If we don't have a pending state, this is a standalone error
      // 3. If pendingState is not CompletedError, we started from a different state
      // 4. If we've seen ANY state update since starting the claim, this is a new error
      // 5. If we're loading and pendingState is CompletedError, this means we retried and got a new error
      //    (even if state is the same, the server processed our request and returned a new error)
      const isRetryingFromError = pendingState === "CompletedError" &&
        !seenUpdate && loading();
      const isNewError = prevState === "InProgress" ||
        pendingState === undefined ||
        pendingState !== "CompletedError" ||
        seenUpdate ||
        !isRetryingFromError;

      if (isNewError) {
        setLoading(false);
        setError("Funding failed. Please try again.");
        setPendingClaimState(undefined);
        setPreviousToolState(tool);
        setHasSeenStateUpdate(false);
      } else {
        setHasSeenStateUpdate(true);
      }
      if (prevState !== tool) {
        setPreviousToolState(tool);
      }
      return;
    }

    if (
      pendingState !== undefined && tool === pendingState && loading() &&
      !seenUpdate
    ) {
      return;
    }

    if (tool === "InProgress") {
      setLoading(true);
      setError(undefined);
      setPreviousToolState(tool);
      setHasSeenStateUpdate(true);
    } else if (tool === "CompletedSuccess") {
      setLoading(false);
      setError(undefined);
      setPendingClaimState(undefined);
      setPreviousToolState(tool);
      setHasSeenStateUpdate(false);
    } else if (tool === "NotStarted" || tool === undefined) {
      setLoading(false);
      setError(undefined);
      setClaimed(false);
      setPendingClaimState(undefined);
      setPreviousToolState(undefined);
      setHasSeenStateUpdate(false);
    } else {
      if (prevState !== tool) {
        setPreviousToolState(tool);
      }
    }
  });

  createEffect(() => {
    if (!isServiceRunning()) {
      return;
    }

    if (nodeAddress() === undefined && isPreparingSafe(appState)) {
      setError("Waiting for node address");
      setLoading(false);
      setClaimed(false);
    } else if (
      nodeAddress() !== undefined && error() === "Waiting for node address"
    ) {
      setError(undefined);
    }
  });

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
      <div class="flex flex-col items-center gap-2 w-full grow">
        <img src={parachute} alt="Parachute" class="w-1/3 mb-8" />
        <div class="w-full text-left">
          If you're a tester, claim wxHOPR and xDAI
        </div>
        <label class="flex flex-col gap-1 w-full">
          <span class="text-sm font-bold">Secret code</span>
          <input
            type="text"
            class="rounded-xl border border-gray-700 p-2 w-full focus:outline-none disabled:cursor-not-allowed"
            value={secretCode()}
            onInput={handleInputSecretCode}
            disabled={isDisabled()}
            onKeyDown={(e) => {
              if ((e as KeyboardEvent).key === "Enter") {
                e.preventDefault();
                const canClaim = secretCode().length > 0 &&
                  !loading() &&
                  !claimed() &&
                  fundingTool() !== "CompletedSuccess" &&
                  !isDisabled();
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
            disabled={secretCode().length === 0 || isDisabled()}
            loading={loading()}
          >
            {loading() ? "Claiming..." : "Claim"}
          </Button>
        </Show>
        <Show when={fundingTool() === "CompletedError" && claimed()}>
          <Button
            size="lg"
            onClick={handleRefresh}
            disabled={isDisabled()}
            loading={loading()}
          >
            {loading() ? "Retrying..." : "Retry"}
          </Button>
        </Show>
        <Show when={error()}>
          <div class="text-red-500 text-sm">{error()}</div>
        </Show>
        <Show when={loading()}>
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
          Skip now
        </Button>
      </Show>
    </div>
  );
}
