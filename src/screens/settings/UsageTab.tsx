import { createMemo, createUniqueId, For, Show } from "solid-js";
import {
  connectionDestination,
  connectionPix,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  computeEffectiveCredit,
  creditBreakdown,
  exitsCovered,
  formatCountCompact,
  formatCreditCompact,
} from "@src/utils/credit.ts";
import { deriveTrafficStatus } from "@src/utils/funding.ts";
import { exitDisplayName, exitShortId } from "@src/utils/destinations.ts";
import Banner from "@src/components/common/Banner.tsx";
import Button from "@src/components/common/Button.tsx";
import Tooltip from "@src/components/common/Tooltip.tsx";
import { ShortId } from "@src/components/exitNode/LocationRow.tsx";
import UsageMeter from "@src/components/exitNode/UsageMeter.tsx";
import CheckCircleIcon from "@src/components/icons/CheckCircleIcon.tsx";
import SettingIcon from "@src/components/icons/SettingIcon.tsx";
import WarningIcon from "@src/components/icons/WarningIcon.tsx";
import BalanceBreakdown from "@src/components/settings/BalanceBreakdown.tsx";
import Notice from "@src/components/settings/Notice.tsx";
import { SettingsHeading } from "@src/components/settings/SettingsGroup.tsx";
import TokenNote from "@src/components/settings/TokenNote.tsx";
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

export default function UsageTab(props: { showBreakdown: boolean }) {
  const [appState] = useAppStore();
  const {
    preparingSafe,
    standIn,
    balanceShown,
    runModeStatus,
    nodeAddress,
    wxhoprStatus,
  } = useFunding();

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
  // The daemon's levels alone (before the first balance) are blind to EOA funds, so they only warrant amber.
  const emptyVariant = () =>
    appState.balance === null ? "warning" as const : "critical" as const;
  // The main screen's banners, minus the X: this tab is where they lead.
  const balanceWarnings = createMemo(() => {
    const warnings: { variant: "warning" | "critical"; text: string }[] = [];
    if (trafficStatus() === "Empty") {
      warnings.push({
        variant: emptyVariant(),
        text: "Balance empty: add data to keep connecting.",
      });
    } else if (trafficStatus() === "Low") {
      const left = renewalsLeft();
      warnings.push({
        variant: "warning",
        text: left === null
          ? "Balance running low."
          : `Balance running low: ${renewals(left)} left.`,
      });
    }
    if (preparingSafe()) {
      warnings.push({ variant: "warning", text: "Waiting for incoming funds" });
    }
    return warnings;
  });

  const enoughData = () => wxhoprStatus() === "Sufficient";

  const breakdown = () =>
    props.showBreakdown && appState.balance
      ? creditBreakdown(appState.balance)
      : null;

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
        <SettingsHeading>Balance</SettingsHeading>
        <div class="flex shrink-0 flex-col gap-2 rounded-xl bg-bg-list px-3.5 pt-4 pb-3.5">
          <span class="text-xs leading-4 text-text-subtle">Available</span>
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
          <Show when={enoughData()}>
            <TokenNote
              icon={<CheckCircleIcon class="size-full text-ok-badge" />}
            >
              You have enough data
            </TokenNote>
          </Show>
        </div>
        <Show when={nodeAddress()}>
          {(address) => (
            <>
              <Button
                size="xl"
                variant="connect"
                class="shrink-0"
                onClick={() => void openFundingSite(address())}
              >
                Open funding site <span aria-hidden="true">↗</span>
              </Button>
              <p class="flex gap-2 px-1 pt-1 text-xs leading-[1.45] text-text-subtle">
                <span class="mt-px shrink-0">
                  <SettingIcon name="info" size={14} />
                </span>
                <span>Funding usually takes 2 minutes.</span>
              </p>
            </>
          )}
        </Show>
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
                          {(d) => <ShortId id={exitShortId(d())} />}
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
        <Show when={breakdown()}>
          {(lines) => (
            <BalanceBreakdown
              lines={lines()}
              xdai={appState.balance?.node ?? 0n}
            />
          )}
        </Show>
        <Show when={balanceWarnings().length > 0}>
          <div class="mt-auto flex shrink-0 flex-col gap-2 pt-2">
            <For each={balanceWarnings()}>
              {(warning) => (
                <Banner variant={warning.variant} icon={<WarningIcon filled />}>
                  {warning.text}
                </Banner>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </>
  );
}
