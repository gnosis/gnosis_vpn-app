import { createSignal } from "solid-js";
import { type BalanceResponse, VPNService } from "@src/services/vpnService.ts";
import { onMount } from "solid-js";
import FundsInfo from "@src/components/FundsInfo.tsx";
import { Show } from "solid-js";
import AirdropClaimBanner from "@src/components/AirdropClaimBanner";
import Help from "@src/components/Help.tsx";
import { applyFundingIssues } from "@src/utils/funding.ts";
import WarningIcon from "@src/components/common/WarningIcon.tsx";
import { useLogsStore } from "@src/stores/logsStore.ts";
import refreshIcon from "@assets/icons/refresh.svg";

export default function Usage() {
  const [balance, setBalance] = createSignal<BalanceResponse | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = createSignal(true);
  const [balanceError, setBalanceError] = createSignal<string | undefined>();
  const [safeStatus, setSafeStatus] = createSignal<string | undefined>();
  const [nodeStatus, setNodeStatus] = createSignal<string | undefined>();
  const [, logActions] = useLogsStore();

  async function loadBalance() {
    setIsBalanceLoading(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setBalanceError(undefined);
    try {
      const result = await VPNService.balance();
      setBalance(result);
      if (result) {
        applyFundingIssues(result.issues, setSafeStatus, setNodeStatus);
      }
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : String(error));
      logActions.append(`Error loading balance: ${String(error)}`);
    } finally {
      setIsBalanceLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      await VPNService.refreshNode();
      await loadBalance();
    } catch (error) {
      logActions.append(`Error refreshing node: ${String(error)}`);
    }
  }

  onMount(() => {
    void loadBalance();
  });

  return (
    <div class="px-4 py-2 flex flex-col w-full h-full items-center gap-2 justify-between">
      <div class="flex flex-col w-full items-center gap-2">
        <Show when={balanceError()}>
          <div class="text-sm text-red-600">{balanceError()}</div>
        </Show>
        <Show when={!isBalanceLoading() && balance() === null}>
          <div class="text-sm text-gray-500">Not available yet</div>
        </Show>

        <FundsInfo
          name="Safe"
          subtitle="For traffic"
          balance={balance()?.safe}
          ticker="wxHOPR"
          address={balance()?.addresses.safe}
          status={safeStatus() ?? "Sufficient"}
          isLoading={isBalanceLoading()}
        />
        <FundsInfo
          name="EOA"
          subtitle="For channels"
          balance={balance()?.node}
          ticker="xDAI"
          address={balance()?.addresses.node}
          status={nodeStatus() ?? "Sufficient"}
          isLoading={isBalanceLoading()}
        />
      </div>

      <div class="flex-grow flex flex-row items-center gap-2 max-w-md">
        <div class="text-xs text-slate-600 px-2">
          <WarningIcon />
          It may take up to 2 minutes until your funds have been registered after transaction.
        </div>
        <div class="w-8 h-8">
          <button type="button" class="h-8 w-8 hover:cursor-pointer" onClick={handleRefresh}>
            <img src={refreshIcon} alt="Refresh" class="h-8 w-8" />
          </button>
        </div>
      </div>
      <div class="flex-grow"></div>
      <Help />
      <AirdropClaimBanner />
    </div>
  );
}
