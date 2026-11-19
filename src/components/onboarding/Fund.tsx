import { Show } from "solid-js";
import Button from "@src/components/common/Button.tsx";
import GnosisVpnLogo from "@src/components/common/GnosisVpnLogo.tsx";
import AccountId from "@src/components/settings/AccountId.tsx";
import { SettingsCard } from "@src/components/settings/SettingsGroup.tsx";
import SendAtLeastRow from "@src/components/onboarding/SendAtLeastRow.tsx";
import SettingIcon from "@src/components/icons/SettingIcon.tsx";

/** First onboarding screen: why to fund, and the funding site. */
export default function Fund(props: {
  disabled: boolean;
  waiting: boolean;
  /** The node's address; empty until the client reports it. */
  address: string;
  onOpenFundingSite: () => void;
}) {
  return (
    <div class="flex h-full w-full flex-col px-4 pt-4 pb-6">
      <div class="flex flex-col items-start gap-2.5 px-1 pt-3.5">
        <GnosisVpnLogo class="mb-0.75 w-[190px] text-logo-ink" />
        <h1 class="text-[26px] leading-tight font-bold text-balance">
          Fund your VPN
        </h1>
        <p class="max-w-[300px] text-[13.5px] leading-normal text-pretty text-text-subtle">
          Once funded, the app takes care of selecting a route and paying node
          runners to transport your data privately.
        </p>
      </div>

      <div class="mt-5">
        <SendAtLeastRow />
      </div>

      <div class="mt-auto pb-3" role="status">
        <Show when={props.waiting}>
          <div class="flex gap-2.5 rounded-[10px] border-[1.5px] border-border bg-bg-list px-3 py-2.5 text-[13px] leading-[1.45]">
            <span class="mt-0.5 shrink-0 text-text-subtle">
              <SettingIcon name="info" size={16} />
            </span>
            <span>
              <b class="font-semibold">Waiting for your payment.</b>{" "}
              <span class="text-text-subtle">Usually about 2 minutes.</span>
            </span>
          </div>
        </Show>
      </div>

      <div class="flex flex-none flex-col gap-2.5">
        <Show when={props.address}>
          {(address) => (
            <SettingsCard label="Gnosis VPN address">
              <AccountId address={address()} iconSlot={false} />
            </SettingsCard>
          )}
        </Show>
        <Button
          size="xl"
          variant="connect"
          disabled={props.disabled}
          onClick={() => props.onOpenFundingSite()}
        >
          Open funding site <span aria-hidden="true">↗</span>
        </Button>
      </div>
    </div>
  );
}
