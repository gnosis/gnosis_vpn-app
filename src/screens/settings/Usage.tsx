import { createSignal, Match, Switch } from "solid-js";
import {
  type BalanceResponse,
  isPreparingSafeRunMode,
  isRunningRunMode,
  isWarmupRunMode,
  VPNService,
} from "../../services/vpnService.ts";
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
import Button from "../../components/common/Button.tsx";
import { useAppStore } from "../../stores/appStore.ts";
import AddFundsModal from "@src/components/AddFundsModal.tsx";

const BALANCE_REFRESH_INTERVAL_MS = 5_000;

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
  const [appState] = useAppStore();

  const preparingSafe =
    () => (isPreparingSafeRunMode(appState.runMode)
      ? appState.runMode.PreparingSafe
      : null);

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
    setIsBalanceLoading(true);
    void loadBalance().finally(() => setIsBalanceLoading(false));
    intervalId = setInterval(() => {
      void loadBalance();
    }, BALANCE_REFRESH_INTERVAL_MS);
  });

  onCleanup(() => {
    clearInterval(intervalId);
  });

  return (
    <div class="p-4 w-full flex flex-col gap-2 items-center">
      <Switch>
        <Match when={appState.vpnStatus === "ServiceUnavailable"}>
          <div class="px-4 py-2 rounded-lg text-sm font-medium bg-red-100 text-red-800">
            Service unavailable
          </div>
        </Match>
        <Match when={appState.vpnStatus === "DeployingSafe"}>
          <div class="px-4 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-800">
            Preparing service
          </div>
        </Match>
        <Match when={isWarmupRunMode(appState.runMode)}>
          <div class="px-4 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-800">
            Syncing in progress
          </div>
        </Match>
        <Match when={isRunningRunMode(appState.runMode) || preparingSafe()}>
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
          <Show when={preparingSafe()}>
            <div class="px-4 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-800">
              Waiting for incoming funds
            </div>
          </Show>

          <div class="flex flex-col gap-2 py-4 my-4 w-64">
            <FundsInfo
              name="Safe"
              subtitle="For traffic"
              balance={preparingSafe()?.node_wxhopr ?? balance()?.safe}
              ticker="wxHOPR"
              address={preparingSafe()?.node_address ??
                balance()?.info.safe_address}
              status={fundingStatus()?.safeStatus}
              isLoading={isBalanceLoading()}
            />
            <FundsInfo
              name="EOA"
              subtitle="For channels"
              balance={preparingSafe()?.node_xdai ?? balance()?.node}
              ticker="xDAI"
              address={preparingSafe()?.node_address ??
                balance()?.info.node_address}
              status={fundingStatus()?.nodeStatus}
              isLoading={isBalanceLoading()}
            />
          </div>

          <div class="w-64 flex flex-col gap-2">
            <Button onClick={() => setIsAddFundsOpen(true)}>Add funds</Button>
            <div class="flex flex-row items-center gap-2 max-w-md">
              <div class="text-xs text-text-secondary px-2">
                <WarningIcon />
                It may take up to 2 minutes until your funds have been
                registered after transaction.
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

          <AddFundsModal
            open={isAddFundsOpen()}
            onClose={() => setIsAddFundsOpen(false)}
            nodeAddress={preparingSafe()?.node_address ??
              balance()?.info.node_address ?? ""}
            safeAddress={preparingSafe()?.node_address ??
              balance()?.info.safe_address ?? ""}
          />
        </Match>
      </Switch>
    </div>
  );
}
