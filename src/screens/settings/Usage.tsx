import { createMemo, createSignal, Match, Switch } from "solid-js";
import {
  isPreparingSafeRunMode,
  isRunningRunMode,
  isWarmupRunMode,
} from "../../services/vpnService.ts";
import {
  computeEffectiveCredit,
  formatCredit,
  sumCapacityStake,
} from "../../utils/credit.ts";
import FundsInfo from "../../components/FundsInfo.tsx";
import { Show } from "solid-js";
import {
  deriveNodeStatus,
  deriveSafeStatus,
  describeCriticalIssue,
} from "../../utils/funding.ts";
import WarningIcon from "../../components/common/WarningIcon.tsx";
import Button from "../../components/common/Button.tsx";
import { useAppStore } from "../../stores/appStore.ts";
import AddFundsModal from "@src/components/AddFundsModal.tsx";

export default function Usage() {
  const [isAddFundsOpen, setIsAddFundsOpen] = createSignal(false);
  const [appState] = useAppStore();

  const preparingSafe =
    () => (isPreparingSafeRunMode(appState.runMode)
      ? appState.runMode.PreparingSafe
      : null);

  const fundingIssues = createMemo(() =>
    isRunningRunMode(appState.runMode)
      ? (appState.runMode.Running.funding_issues ?? [])
      : []
  );

  const effectiveCredit = createMemo(() => {
    const b = appState.balance;
    if (!b) return null;
    return computeEffectiveCredit(b.capacity_allocations ?? []);
  });

  const totalWxhoprWei = createMemo(() => {
    const b = appState.balance;
    if (!b?.capacity_allocations) return undefined;
    return sumCapacityStake(b.capacity_allocations).toString();
  });

  const isBalanceLoading = () => appState.balance === null;

  const criticalIssue = createMemo(() => fundingIssues()[0]);
  const isCriticalLevel = createMemo(() =>
    criticalIssue() === "Unfunded" || criticalIssue() === "ChannelsOutOfFunds"
  );

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
          <Show when={describeCriticalIssue(fundingIssues())}>
            {(description) => (
              <div
                class={`px-4 py-2 rounded-lg text-sm font-medium ${
                  isCriticalLevel()
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                <div class="flex items-center gap-2">
                  <WarningIcon />
                  <span>{description()}</span>
                </div>
              </div>
            )}
          </Show>
          <Show when={preparingSafe()}>
            <div class="px-4 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-800">
              Waiting for incoming funds
            </div>
          </Show>

          <div class="flex flex-col py-4 my-4 w-64">
            <div class="flex flex-col pb-3 mb-3">
              <FundsInfo
                name="Safe"
                subtitle="For traffic"
                balance={preparingSafe()?.node_wxhopr ?? totalWxhoprWei()}
                ticker="wxHOPR"
                address={preparingSafe()?.node_address ??
                  appState.balance?.info.safe_address}
                status={deriveSafeStatus(fundingIssues())}
                isLoading={isBalanceLoading()}
              />
              <Show
                when={effectiveCredit() !== null &&
                  isRunningRunMode(appState.runMode)}
              >
                <div class="text-xs mt-1 pr-1 text-right">
                  <div
                    class={deriveSafeStatus(fundingIssues()) === "Empty"
                      ? "text-vpn-red"
                      : "text-text-secondary"}
                  >
                    ≈{formatCredit(effectiveCredit()!)}
                  </div>
                </div>
              </Show>
            </div>
            <FundsInfo
              name="EOA"
              subtitle="For channels"
              balance={preparingSafe()?.node_xdai ?? appState.balance?.node}
              ticker="xDAI"
              address={preparingSafe()?.node_address ??
                appState.balance?.info.node_address}
              status={deriveNodeStatus(fundingIssues())}
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
            </div>
          </div>

          <div class="grow"></div>

          <AddFundsModal
            open={isAddFundsOpen()}
            onClose={() => setIsAddFundsOpen(false)}
            nodeAddress={preparingSafe()?.node_address ??
              appState.balance?.info.node_address ?? ""}
          />
        </Match>
      </Switch>
    </div>
  );
}
