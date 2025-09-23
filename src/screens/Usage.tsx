import { createSignal } from "solid-js";
import { SecondaryScreen } from "../components/common/SecondaryScreen";
import { type BalanceResponse, VPNService } from "../services/vpnService";
import { onMount } from "solid-js";
import Button from "../components/common/Button";
import FundsInfo from "../components/FundsInfo";
import { Show } from "solid-js";
import AirdropClaim from "../components/AirdropClaim";
import Help from "../components/Help";
import { applyFundingIssues } from "../utils/funding";
import { useAppStore } from "../stores/appStore";

export default function Usage() {
  const [balance, setBalance] = createSignal<BalanceResponse | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = createSignal(false);
  const [balanceError, setBalanceError] = createSignal<string | undefined>();
  const [safeStatus, setSafeStatus] = createSignal<string | undefined>();
  const [nodeStatus, setNodeStatus] = createSignal<string | undefined>();
  const [, appActions] = useAppStore();

  async function loadBalance() {
    setIsBalanceLoading(true);
    setBalanceError(undefined);
    try {
      const result = await VPNService.balance();
      setBalance(result);
      if (result) {
        applyFundingIssues(result.issues, setSafeStatus, setNodeStatus);
      }
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : String(error));
      appActions.log(`Error loading balance: ${String(error)}`);
    } finally {
      setIsBalanceLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      await VPNService.refreshNode();
    } catch (error) {
      appActions.log(`Error refreshing node: ${String(error)}`);
    }
    await loadBalance();
  }

  onMount(() => {
    void loadBalance();
  });

  return (
    <SecondaryScreen title="Usage / Budget">
      <div class="px-4 py-2 flex flex-col w-full items-center gap-2 justify-between">
        <div class="flex flex-col w-full items-center gap-2">
          <Show when={balanceError()}>
            <div class="text-sm text-red-600">{balanceError()}</div>
          </Show>
          <Show when={isBalanceLoading()}>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Loading balance…
            </div>
          </Show>
          <Show when={!isBalanceLoading() && balance() === null}>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Not available yet
            </div>
          </Show>
          <Show when={balance()} keyed>
            {(b) => (
              <>
                <FundsInfo
                  name="Safe"
                  subtitle="For traffic"
                  balance={b.safe}
                  ticker="wxHOPR"
                  address={b.addresses.safe}
                  status={safeStatus() ?? "Sufficient"}
                />
                <FundsInfo
                  name="EOA"
                  subtitle="For channels"
                  balance={b.node}
                  ticker="xDAI"
                  address={b.addresses.node}
                  status={nodeStatus() ?? "Sufficient"}
                />
              </>
            )}
          </Show>
        </div>
        <div class="flex-grow flex justify-between items-center gap-2">
          <div class="text-xs text-slate-600 px-2">
            <img
              src="/icons/warning.png"
              height={12}
              width={12}
              alt="Warning"
              class="inline mb-0.5 mr-1"
            />
            It may take up to 2 minutes until your funds have been registered
            after transaction.
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={isBalanceLoading()}
            onClick={() => void handleRefresh()}
          >
            Refresh
          </Button>
        </div>
        <Help />
        <AirdropClaim />
      </div>
    </SecondaryScreen>
  );
}
