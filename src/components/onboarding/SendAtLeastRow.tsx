import { createMemo, Show } from "solid-js";
import { useAppStore } from "@src/stores/appStore.ts";
import { formatCreditCompact, sumCapacityStake } from "@src/utils/credit.ts";
import { dataToSend, formatDataToSend } from "@src/utils/funding.ts";
import DataAmount from "@src/components/common/DataAmount.tsx";
import ArrowRightIcon from "@src/components/icons/ArrowRightIcon.tsx";
import CheckCircleIcon from "@src/components/icons/CheckCircleIcon.tsx";
import { SettingsCard } from "@src/components/settings/SettingsGroup.tsx";
import TokenNote from "@src/components/settings/TokenNote.tsx";
import { useFunding } from "@src/screens/settings/useFunding.ts";

/** The minimum data to start at the PIX price, and what the node already holds, on the onboarding Fund screen. */
export default function SendAtLeastRow() {
  const [appState] = useAppStore();
  const funding = useFunding();

  const wxhopr = createMemo(() =>
    funding.preparingSafe()?.node_wxhopr ??
      (appState.balance ? sumCapacityStake(appState.balance) : null)
  );
  const price = () => appState.pixPricePerByte;
  // The client's minimum to start; it stays put while funds arrive.
  const minimum = () => {
    const wxhopr = funding.preparingSafe()?.balance_recommendation?.wxhopr;
    const bytes = wxhopr === undefined ? null : dataToSend(wxhopr, price());
    return bytes === null ? "—" : formatDataToSend(bytes);
  };
  // Bytes the node's funds buy; null without a price.
  const fundedBytes = () => {
    const funds = wxhopr();
    return funds === null || price() <= 0n ? null : funds / price();
  };

  return (
    <div class="flex flex-col gap-1.5">
      <SettingsCard label="Balance">
        <div class="flex flex-col gap-2 px-3.5 pt-4 pb-3.5">
          <span class="flex items-center gap-1.5 text-xs leading-4 text-text-subtle">
            <ArrowRightIcon class="size-3.5 text-ok-badge" />
            Send at least
          </span>
          <span class="cursor-text font-figures text-[34px] leading-none font-semibold tracking-[-0.04em] select-text">
            <DataAmount text={minimum()} />
          </span>
          <span class="text-xs leading-4 text-text-subtle">
            to initialize the VPN
          </span>
          <Show when={funding.wxhoprStatus() === "Sufficient"}>
            <TokenNote
              icon={<CheckCircleIcon class="size-full text-ok-badge" />}
            >
              You have enough data
            </TokenNote>
          </Show>
        </div>
      </SettingsCard>
      <Show when={(fundedBytes() ?? 0n) > 0n}>
        <span class="px-3.5 text-xs leading-4 text-text-subtle">
          Already funded with{" "}
          <span class="cursor-text font-figures font-bold text-text-primary select-text">
            {formatCreditCompact(fundedBytes()!)}
          </span>
        </span>
      </Show>
    </div>
  );
}
