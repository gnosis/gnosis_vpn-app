import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  Show,
  Switch,
} from "solid-js";
import {
  isPreparingSafeRunMode,
  isRunningRunMode,
  warmupProgress,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  computeEffectiveCredit,
  exitsCovered,
  formatCredit,
} from "@src/utils/credit.ts";
import {
  deriveNodeStatus,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  deriveXdaiDeficit,
} from "@src/utils/funding.ts";
import {
  clearSettingsRequest,
  settingsRequest,
} from "@src/utils/settingsPage.ts";
import AddFundsModal from "@src/components/AddFundsModal.tsx";
import FeatureComing from "@src/components/settings/FeatureComing.tsx";
import Notice from "@src/components/settings/Notice.tsx";
import {
  SettingsCard,
  SettingsHeading,
} from "@src/components/settings/SettingsGroup.tsx";
import SettingsRow, {
  ROW_BUTTON,
} from "@src/components/settings/SettingsRow.tsx";
import SettingSwitch from "@src/components/settings/Switch.tsx";

function renewals(count: bigint): string {
  if (count === 0n) return "no renewals";
  return `${count} ${count === 1n ? "renewal" : "renewals"}`;
}

export default function UsageTab() {
  const [appState] = useAppStore();
  const [isAddFundsOpen, setIsAddFundsOpen] = createSignal(false);

  // The balance popover's "Add data" lands here.
  createEffect(() => {
    if (settingsRequest() !== "add-funds") return;
    clearSettingsRequest();
    setIsAddFundsOpen(true);
  });

  const preparingSafe =
    () => (isPreparingSafeRunMode(appState.runMode) ? appState.runMode : null);
  const runModeStatus = createMemo(() =>
    isRunningRunMode(appState.runMode) ? appState.runMode.funding_status : null
  );

  const credit = createMemo(() =>
    appState.balance ? computeEffectiveCredit(appState.balance) : null
  );
  const renewalsLeft = () => exitsCovered(credit() ?? 0n);

  const trafficStatus = createMemo(() =>
    deriveTrafficStatus(appState.balance, runModeStatus())
  );
  const gasStatus = createMemo(() =>
    deriveNodeStatus(appState.balance, runModeStatus())
  );
  // The daemon's levels alone (before the first balance) are blind to EOA funds, so they only warrant amber.
  const emptyTone = () => (appState.balance === null ? "warn" : "bad");

  return (
    <>
      <Switch>
        <Match when={appState.vpnStatus === "WorkerRestarting"}>
          <Notice tone="warn">Service restarting</Notice>
        </Match>
        <Match when={appState.vpnStatus === "ServiceUnavailable"}>
          <Notice tone="bad">Service unavailable</Notice>
        </Match>
        <Match when={appState.vpnStatus === "InUseByOtherUser"}>
          <Notice tone="warn">In use by another user on this computer</Notice>
        </Match>
        <Match when={appState.vpnStatus === "DeployingSafe"}>
          <Notice tone="warn">Preparing service</Notice>
        </Match>
        <Match when={warmupProgress(appState.runMode)}>
          <Notice tone="warn">Syncing in progress</Notice>
        </Match>
        <Match when={isRunningRunMode(appState.runMode) || preparingSafe()}>
          <div class="relative flex shrink-0 flex-col gap-2 rounded-xl bg-bg-list px-3.5 pt-4 pb-3.5">
            <span class="text-xs leading-4 text-text-subtle">
              Available balance
            </span>
            <div class="flex items-baseline gap-2.5">
              <span class="font-figures text-[34px] leading-none font-semibold tracking-[-0.04em]">
                {/* Explicit null check: credit can be 0n, which is falsy */}
                {credit() === null ? "—" : formatCredit(credit()!)}
              </span>
              <Show when={credit() !== null}>
                <span class="shrink-0 rounded-full bg-control-bg px-2 py-0.5 text-[11px] leading-4 font-bold text-text-soft">
                  {renewals(renewalsLeft())}
                </span>
              </Show>
            </div>
            <button
              type="button"
              class={`${ROW_BUTTON} absolute top-3.5 right-3.5`}
              onClick={() => setIsAddFundsOpen(true)}
            >
              Add data
            </button>
          </div>
          <Switch>
            <Match when={trafficStatus() === "Empty"}>
              <Notice tone={emptyTone()}>
                Balance empty: no renewals left.
              </Notice>
            </Match>
            <Match when={trafficStatus() === "Low"}>
              <Notice tone="warn">
                Balance running low: {renewals(renewalsLeft())} left.
              </Notice>
            </Match>
          </Switch>
          <Switch>
            <Match when={gasStatus() === "Empty"}>
              <Notice tone={emptyTone()}>Gas is empty — top up xDAI.</Notice>
            </Match>
            <Match when={gasStatus() === "Low"}>
              <Notice tone="warn">Gas is low — top up xDAI.</Notice>
            </Match>
          </Switch>
          <Show when={preparingSafe()}>
            <Notice tone="warn">Waiting for incoming funds</Notice>
          </Show>
          <AddFundsModal
            open={isAddFundsOpen()}
            onClose={() => setIsAddFundsOpen(false)}
            nodeAddress={preparingSafe()?.node_address ??
              appState.balance?.info.node_address ?? ""}
            wxhoprDeficit={deriveWxhoprDeficit(
              appState.balance,
              runModeStatus(),
            ) ?? deriveRefillShortfall(appState.balance, runModeStatus())}
            xdaiDeficit={deriveXdaiDeficit(appState.balance, runModeStatus())}
          />
        </Match>
      </Switch>

      <SettingsHeading>Renewing</SettingsHeading>
      <SettingsCard label="Renewing">
        <FeatureComing class="w-full">
          <SettingsRow
            icon="renew"
            title="Auto-renew and allocation"
            description="Sets aside 600 MB by itself when you connect, switch exits, or an exit runs low. Off: you’re asked each time."
          >
            <SettingSwitch
              label="Auto-renew and allocation"
              checked={false}
              disabled
            />
          </SettingsRow>
        </FeatureComing>
      </SettingsCard>
    </>
  );
}
