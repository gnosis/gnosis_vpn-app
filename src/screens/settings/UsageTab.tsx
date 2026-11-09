import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  Show,
  Switch,
  untrack,
} from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  isPreparingSafeRunMode,
  isRunningRunMode,
  warmupProgress,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  computeEffectiveCredit,
  exitsCovered,
  formatCountCompact,
  formatCreditCompact,
} from "@src/utils/credit.ts";
import {
  deriveNodeStatus,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  deriveXdaiDeficit,
} from "@src/utils/funding.ts";
import { logWarn } from "@src/utils/appLog.ts";
import {
  clearSettingsRequest,
  settingsRequest,
} from "@src/utils/settingsPage.ts";
import AddFundsModal from "@src/components/AddFundsModal.tsx";
import BackIcon from "@src/components/icons/BackIcon.tsx";
import Notice from "@src/components/settings/Notice.tsx";
import { SettingsCard } from "@src/components/settings/SettingsGroup.tsx";
import SettingsRow from "@src/components/settings/SettingsRow.tsx";

const FUNDING_SITE_URL = "https://funding.vpn.gnosis.eth.limo/";

async function openFundingSite(address: string) {
  const url = `${FUNDING_SITE_URL}?address=${encodeURIComponent(address)}`;
  try {
    await openUrl(url);
  } catch (e) {
    logWarn(`Failed to open ${url}: ${e}`);
  }
}

function renewals(count: bigint): string {
  if (count === 0n) return "no renewals";
  return `${formatCountCompact(count)} ${
    count === 1n ? "renewal" : "renewals"
  }`;
}

export default function UsageTab() {
  const [appState] = useAppStore();
  const [isAddFundsOpen, setIsAddFundsOpen] = createSignal(false);

  const preparingSafe =
    () => (isPreparingSafeRunMode(appState.runMode) ? appState.runMode : null);
  // What stands in for the balance card while the service cannot report one.
  const standIn = createMemo(
    (): { tone: "warn" | "bad"; text: string } | null => {
      switch (appState.vpnStatus) {
        case "WorkerRestarting":
          return { tone: "warn", text: "Service restarting" };
        case "ServiceUnavailable":
          return { tone: "bad", text: "Service unavailable" };
        case "InUseByOtherUser":
          return {
            tone: "warn",
            text: "In use by another user on this computer",
          };
        case "DeployingSafe":
          return { tone: "warn", text: "Preparing service" };
      }
      return warmupProgress(appState.runMode)
        ? { tone: "warn", text: "Syncing in progress" }
        : null;
    },
  );
  // The Add funds modal renders with the balance card, so it can only open while the card shows.
  const balanceShown = () =>
    standIn() === null &&
    (isRunningRunMode(appState.runMode) || preparingSafe() !== null);

  // The balance popover's "Add data" lands here; before the card shows it only opens the tab.
  createEffect(() => {
    if (settingsRequest() !== "add-funds") return;
    clearSettingsRequest();
    if (untrack(balanceShown)) setIsAddFundsOpen(true);
  });
  // Closed with the card, so it cannot pop up by itself when the card comes back.
  createEffect(() => {
    if (!balanceShown()) setIsAddFundsOpen(false);
  });
  const runModeStatus = createMemo(() =>
    isRunningRunMode(appState.runMode) ? appState.runMode.funding_status : null
  );
  const nodeAddress = () =>
    preparingSafe()?.node_address ?? appState.balance?.info.node_address ?? "";

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
      <Show when={standIn()}>
        {(notice) => <Notice tone={notice().tone}>{notice().text}</Notice>}
      </Show>
      <Show when={balanceShown()}>
        <div class="flex shrink-0 flex-col gap-2 rounded-xl bg-bg-list px-3.5 pt-4 pb-3.5">
          <span class="text-xs leading-4 text-text-subtle">
            Available balance
          </span>
          <div class="flex items-baseline gap-2.5">
            <span class="font-figures text-[34px] leading-none font-semibold tracking-[-0.04em]">
              {/* Explicit null check: credit can be 0n, which is falsy */}
              {credit() === null ? "—" : formatCreditCompact(credit()!)}
            </span>
            <Show when={credit() !== null}>
              <span class="ml-auto shrink-0 rounded-full bg-control-bg px-2 py-0.5 text-[11px] leading-4 font-bold text-text-soft">
                {renewals(renewalsLeft())}
              </span>
            </Show>
          </div>
        </div>
        <Switch>
          <Match when={trafficStatus() === "Empty"}>
            <Notice tone={emptyTone()}>
              Balance empty: add data to keep connecting.
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
        <SettingsCard label="Funding">
          <SettingsRow
            icon="add"
            title="Add funds directly"
            onClick={() => setIsAddFundsOpen(true)}
          >
            <BackIcon class="rotate-180 text-text-subtle" />
          </SettingsRow>
          <Show when={nodeAddress()}>
            {(address) => (
              <SettingsRow
                icon="external"
                title="Open funding site"
                onClick={() => void openFundingSite(address())}
              >
                <BackIcon class="rotate-180 text-text-subtle" />
              </SettingsRow>
            )}
          </Show>
        </SettingsCard>
        <AddFundsModal
          open={isAddFundsOpen()}
          onClose={() => setIsAddFundsOpen(false)}
          nodeAddress={nodeAddress()}
          wxhoprDeficit={deriveWxhoprDeficit(
            appState.balance,
            runModeStatus(),
          ) ?? deriveRefillShortfall(appState.balance, runModeStatus())}
          xdaiDeficit={deriveXdaiDeficit(appState.balance, runModeStatus())}
        />
      </Show>
    </>
  );
}
