import { createSignal } from "solid-js";
import { type BalanceResponse, VPNService } from "../../services/vpnService.ts";
import { onCleanup, onMount } from "solid-js";
import FundsInfo from "../../components/FundsInfo.tsx";
import { Show } from "solid-js";
import {
  calculateGlobalFundingStatus,
  type GlobalFundingStatus,
} from "../../utils/funding.ts";
import WarningIcon from "../../components/common/WarningIcon.tsx";
import { useLogsStore } from "../../stores/logsStore.ts";
import refreshIcon from "../../assets/icons/refresh.svg";
import { Modal } from "../../components/common/Modal.tsx";
import Button from "../../components/common/Button.tsx";
import FundingAddress from "../../components/FundingAddress.tsx";

const BALANCE_REFRESH_INTERVAL_MS = 1000;

function balancesEqual(
  a: BalanceResponse | null,
  b: BalanceResponse | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    a.node === b.node &&
    a.safe === b.safe &&
    a.channels_out === b.channels_out &&
    a.info.node_address === b.info.node_address &&
    a.info.node_peer_id === b.info.node_peer_id &&
    a.info.safe_address === b.info.safe_address &&
    JSON.stringify(a.issues) === JSON.stringify(b.issues)
  );
}

export default function Usage() {
  const [balance, setBalance] = createSignal<BalanceResponse | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = createSignal(true);
  const [fundingStatus, setFundingStatus] = createSignal<
    GlobalFundingStatus | null
  >(null);
  const [isAddFundsOpen, setIsAddFundsOpen] = createSignal(false);
  const [, logActions] = useLogsStore();

  async function loadBalance() {
    try {
      const result = await VPNService.balance();
      const currentBalance = balance();

      if (!balancesEqual(result, currentBalance)) {
        setBalance(result);
        if (result) {
          const status = calculateGlobalFundingStatus(result.issues, {
            safe: result.safe,
            node: result.node,
          });
          setFundingStatus(status);
        } else {
          setFundingStatus(null);
        }
      }
    } catch (error) {
      logActions.append(`Error loading balance: ${String(error)}`);
      setFundingStatus(null);
    } finally {
      setIsBalanceLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      await VPNService.refreshNode();
      setIsBalanceLoading(true);
      await loadBalance();
    } catch (error) {
      logActions.append(`Error refreshing node: ${String(error)}`);
    } finally {
      setIsBalanceLoading(false);
    }
  }

  let intervalId: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    try {
      setIsBalanceLoading(true);
      void loadBalance();
      intervalId = setInterval(() => {
        void loadBalance();
      }, BALANCE_REFRESH_INTERVAL_MS);
    } finally {
      setIsBalanceLoading(false);
    }
  });

  onCleanup(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  return (
    <>
      <div class="px-4 py-2 flex flex-col w-full h-full items-center gap-4 justify-between select-none">
        <div class="w-full h-5">
          <Show when={!isBalanceLoading() && balance() === null}>
            <div class="text-sm text-center text-red-500">Not available</div>
          </Show>
        </div>

        <Show when={fundingStatus()?.description}>
          <div
            class={`px-4 py-2 rounded-lg text-sm font-medium ${
              fundingStatus()?.overall === "Empty"
                ? "bg-red-100 text-red-800"
                : fundingStatus()?.overall === "Low"
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            <div class="flex items-center gap-2">
              <WarningIcon />
              <span>{fundingStatus()?.description}</span>
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
            status={fundingStatus()?.safeStatus}
            isLoading={isBalanceLoading()}
          />
          <FundsInfo
            name="EOA"
            subtitle="For channels"
            balance={balance()?.node}
            ticker="xDAI"
            address={balance()?.info.node_address}
            status={fundingStatus()?.nodeStatus}
            isLoading={isBalanceLoading()}
          />
        </div>

        <div class="w-64 flex flex-col gap-2">
          <Button onClick={() => setIsAddFundsOpen(true)}>Add funds</Button>
          <div class="flex flex-row items-center gap-2 max-w-md">
            <div class="text-xs text-text-secondary px-2">
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
                <img
                  src={refreshIcon}
                  alt="Refresh"
                  class="h-8 w-8 dark:invert"
                />
              </button>
            </div>
          </div>
        </div>

        <div class="grow"></div>
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
