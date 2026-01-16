import { createSignal } from "solid-js";
import { type BalanceResponse, VPNService } from "@src/services/vpnService.ts";
import { onMount } from "solid-js";
import FundsInfo from "@src/components/FundsInfo.tsx";
import { Show } from "solid-js";
// import Help from "@src/components/Help.tsx";
import {
  calculateGlobalFundingStatus,
  type GlobalFundingStatus,
} from "@src/utils/funding.ts";
import WarningIcon from "@src/components/common/WarningIcon.tsx";
import { useLogsStore } from "@src/stores/logsStore.ts";
import refreshIcon from "@assets/icons/refresh.svg";
import { Modal } from "../../components/common/Modal.tsx";
import Button from "../../components/common/Button.tsx";
import FundingAddress from "../../components/FundingAddress.tsx";

export default function Usage() {
  const [balance, setBalance] = createSignal<BalanceResponse | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = createSignal(true);
  const [balanceError, setBalanceError] = createSignal<string | undefined>();
  const [fundingStatus, setFundingStatus] = createSignal<GlobalFundingStatus>({
    overall: "Sufficient",
    safeStatus: "Sufficient",
    nodeStatus: "Sufficient",
  });
  const [isAddFundsOpen, setIsAddFundsOpen] = createSignal(false);
  const [, logActions] = useLogsStore();

  async function loadBalance() {
    setIsBalanceLoading(true);
    setBalanceError(undefined);
    try {
      const result = await VPNService.balance();
      console.log("balance result", result);
      setBalance(result);
      if (result) {
        const status = calculateGlobalFundingStatus(result.issues, {
          safe: result.safe,
          node: result.node,
        });
        setFundingStatus(status);
        console.log("Global funding status:", status);
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
    <>
      <div class="px-4 py-2 flex flex-col w-full h-full items-center gap-4 justify-between">
        <Show when={balanceError()}>
          <div class="text-sm text-red-600">{balanceError()}</div>
        </Show>
        <Show when={!isBalanceLoading() && balance() === null}>
          <div class="text-sm text-gray-500">Not available yet</div>
        </Show>

        {/* Global funding status indicator */}
        <Show when={fundingStatus().description}>
          <div
            class={`px-4 py-2 rounded-lg text-sm font-medium ${
              fundingStatus().overall === "Empty"
                ? "bg-red-100 text-red-800"
                : fundingStatus().overall === "Low"
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            <div class="flex items-center gap-2">
              <WarningIcon />
              <span>{fundingStatus().description}</span>
            </div>
          </div>
        </Show>

        <div class="flex flex-col gap-2 py-4 my-4 w-64">
          <FundsInfo
            name="Safe"
            subtitle="For traffic"
            balance={balance()?.safe}
            ticker="wxHOPR"
            address={balance()?.info.safe_address}
            status={fundingStatus().safeStatus}
            isLoading={isBalanceLoading()}
          />
          <FundsInfo
            name="EOA"
            subtitle="For channels"
            balance={balance()?.node}
            ticker="xDAI"
            address={balance()?.info.node_address}
            status={fundingStatus().nodeStatus}
            isLoading={isBalanceLoading()}
          />
        </div>

        <div class="w-64 flex flex-col gap-2">
          <Button onClick={() => setIsAddFundsOpen(true)}>Add funds</Button>
          <div class="flex flex-row items-center gap-2 max-w-md">
            <div class="text-xs text-slate-600 px-2">
              <WarningIcon />
              It may take up to 2 minutes until your funds have been registered
              after transaction.
            </div>
            <div class="w-8 h-8">
              <button
                type="button"
                class="h-8 w-8 hover:cursor-pointer"
                onClick={handleRefresh}
              >
                <img src={refreshIcon} alt="Refresh" class="h-8 w-8" />
              </button>
            </div>
          </div>
        </div>

        <div class="grow"></div>
        {/* <Help /> */}
      </div>

      <Modal open={isAddFundsOpen()} onClose={() => setIsAddFundsOpen(false)}>
        <div class="flex flex-col gap-8">
          <div class="text-base font-semibold">Add funds</div>
          <div class="flex flex-col gap-4 my-2">
            <div class="text-xl font-bold">Transfer xDAI to EOA address</div>
            <FundingAddress
              address={balance()?.info.node_address}
              full
              title="Transfer xDAI"
            />
          </div>
          <div class="flex flex-col gap-4 my-2">
            <div class="text-xl font-bold">
              Transfer wxHOPR to Safe wallet address
            </div>
            <FundingAddress
              address={balance()?.info.safe_address}
              full
              title="Transfer wxHOPR"
            />
          </div>
          <div class="flex flex-row justify-end gap-2">
            <Button size="md" onClick={() => setIsAddFundsOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
