import {
  createEffect,
  createMemo,
  createUniqueId,
  Match,
  Show,
  Switch,
  untrack,
} from "solid-js";
import {
  connectionDestination,
  connectionPix,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  computeEffectiveCredit,
  exitsCovered,
  formatCountCompact,
  formatCreditCompact,
} from "@src/utils/credit.ts";
import { deriveNodeStatus, deriveTrafficStatus } from "@src/utils/funding.ts";
import { exitDisplayName, exitShortId } from "@src/utils/destinations.ts";
import {
  clearSettingsRequest,
  settingsRequest,
} from "@src/utils/settingsPage.ts";
import Tooltip from "@src/components/common/Tooltip.tsx";
import { ShortId } from "@src/components/exitNode/LocationRow.tsx";
import UsageMeter from "@src/components/exitNode/UsageMeter.tsx";
import BackIcon from "@src/components/icons/BackIcon.tsx";
import SettingIcon from "@src/components/icons/SettingIcon.tsx";
import Notice from "@src/components/settings/Notice.tsx";
import {
  SettingsCard,
  SettingsHeading,
} from "@src/components/settings/SettingsGroup.tsx";
import SettingsRow from "@src/components/settings/SettingsRow.tsx";
import { openFundingSite, useFunding } from "./useFunding.ts";

// The client reports no session lifetime yet, so the expiry value reads "Feature coming".
const SESSION_EXPIRY_NOTE =
  "For now, the session expiry gets renewed automatically.";
// Back once sessions expire:
// const SESSION_EXPIRY_NOTE =
//   "Relay channels close after 3 h, because keeping them open costs data. Connecting again opens new ones.";

function SessionExpiryInfo() {
  const descriptionId = createUniqueId();
  return (
    <Tooltip
      content={
        <div class="flex flex-col gap-2">
          <p class="flex justify-between gap-4">
            <span>Session expiry</span>
            <span class="font-bold">Feature coming</span>
          </p>
          <p class="text-gray-300">{SESSION_EXPIRY_NOTE}</p>
        </div>
      }
      position="bottom"
      triggerClass="w-fit shrink-0"
    >
      <span
        class="inline-flex cursor-help text-text-subtle"
        tabIndex={0}
        aria-label="Session expiry"
        aria-describedby={descriptionId}
      >
        <SettingIcon name="info" size={14} />
      </span>
      {/* Always in the DOM so the description resolves on focus; the portalled bubble mounts too late for that. */}
      <span id={descriptionId} class="sr-only">
        Feature coming. {SESSION_EXPIRY_NOTE}
      </span>
    </Tooltip>
  );
}

function renewals(count: bigint): string {
  if (count === 0n) return "no renewals";
  return `${formatCountCompact(count)} ${
    count === 1n ? "renewal" : "renewals"
  }`;
}

export default function UsageTab(props: { onAddFunds: () => void }) {
  const [appState] = useAppStore();
  const { preparingSafe, standIn, balanceShown, runModeStatus, nodeAddress } =
    useFunding();

  // The balance popover's "Add data" lands here; before the card shows it only opens the tab.
  createEffect(() => {
    if (settingsRequest() !== "add-funds") return;
    clearSettingsRequest();
    if (untrack(balanceShown)) props.onAddFunds();
  });

  const credit = createMemo(() =>
    appState.balance ? computeEffectiveCredit(appState.balance) : null
  );
  // Unknown until the node reports its chunk size.
  const renewalsLeft = () => {
    const chunk = appState.pixChunkBytes;
    if (chunk === null) return null;
    return exitsCovered(credit() ?? 0n, BigInt(chunk));
  };

  const trafficStatus = createMemo(() =>
    deriveTrafficStatus(appState.balance, runModeStatus())
  );
  const gasStatus = createMemo(() =>
    deriveNodeStatus(appState.balance, runModeStatus())
  );
  // The daemon's levels alone (before the first balance) are blind to EOA funds, so they only warrant amber.
  const emptyTone = () => (appState.balance === null ? "warn" : "bad");

  // The exit whose session the meter reports; a reconnect has none.
  const liveExitId = () => {
    const c = appState.connection;
    const live = c.type === "connected" || connectionPix(c) !== null;
    return live ? connectionDestination(c) : null;
  };

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
            <Show when={credit() !== null && renewalsLeft() !== null}>
              <span class="ml-auto shrink-0 rounded-full bg-control-bg px-2 py-0.5 text-[11px] leading-4 font-bold text-text-soft">
                {renewals(renewalsLeft()!)}
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
              <Show
                when={renewalsLeft() !== null}
                fallback="Balance running low."
              >
                Balance running low: {renewals(renewalsLeft()!)} left.
              </Show>
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
            onClick={() => props.onAddFunds()}
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
        <SettingsHeading>This exit</SettingsHeading>
        <div class="flex shrink-0 flex-col rounded-xl bg-bg-list px-3.5 py-3.5">
          <UsageMeter
            keepBar
            label={
              <Show when={liveExitId()} fallback="Not connected">
                {(id) => {
                  const exit = () => appState.destinations[id()]?.destination;
                  return (
                    <>
                      <span class="truncate font-medium text-text-primary">
                        {exit() ? exitDisplayName(exit()!) : "Unavailable exit"}
                        <Show when={exit()}>
                          {(d) => <ShortId id={exitShortId(d().address)} />}
                        </Show>
                      </span>
                      <SessionExpiryInfo />
                    </>
                  );
                }}
              </Show>
            }
          />
        </div>
      </Show>
    </>
  );
}
