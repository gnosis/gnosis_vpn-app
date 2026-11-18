import { createMemo, Show } from "solid-js";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  BYTES_PER_GB,
  formatCreditCompact,
  sumCapacityStake,
} from "@src/utils/credit.ts";
import {
  dataToSend,
  formatDataToSend,
  type StatusText,
} from "@src/utils/funding.ts";
import ArrowRightIcon from "@src/components/icons/ArrowRightIcon.tsx";
import CheckCircleIcon from "@src/components/icons/CheckCircleIcon.tsx";
import TokenNote from "@src/components/settings/TokenNote.tsx";
import { useFunding } from "@src/screens/settings/useFunding.ts";

/** A status's colour. */
function useStatusClass(): (status: StatusText | null) => string {
  const [appState] = useAppStore();
  const funding = useFunding();
  // The daemon's levels alone (before the first balance) are blind to EOA funds, so they only warrant amber; preparing_safe's node balances are exact.
  return (status) => {
    if (status === "Sufficient") return "text-ok-ink";
    if (
      status === "Empty" &&
      (appState.balance !== null || funding.preparingSafe() !== null)
    ) return "text-bad-ink";
    return "text-warn-ink";
  };
}

/** The node's wxHOPR as data at the PIX price, its level and what to send, on the onboarding Fund screen. */
export default function WxhoprRow() {
  const [appState] = useAppStore();
  const funding = useFunding();
  const statusClass = useStatusClass();

  const wxhopr = createMemo(() =>
    funding.preparingSafe()?.node_wxhopr ??
      (appState.balance ? sumCapacityStake(appState.balance) : null)
  );
  const price = () => appState.pixPricePerByte;
  const status = funding.wxhoprStatus;
  const data = () => {
    const funds = wxhopr();
    return funds === null || price() <= 0n
      ? "—"
      : formatCreditCompact(funds / price());
  };
  const toSend = () => {
    const shortfall = funding.wxhoprShortfall();
    const bytes = shortfall === null
      ? null
      : dataToSend(shortfall, price(), BYTES_PER_GB);
    return bytes === null ? null : formatDataToSend(bytes);
  };

  return (
    <div class="flex flex-col gap-1 px-3.5 py-2.5">
      <div class="flex items-center gap-3">
        <span class="min-w-0 flex-1 text-[13px] leading-4.5">
          <span class="font-bold">wxHOPR</span>
          <small class="mt-0.5 block text-xs leading-normal text-text-subtle">
            Pays for your traffic
          </small>
        </span>
        <span class="flex shrink-0 flex-col items-end">
          <span class="cursor-text font-figures text-[13px] leading-4.5 font-semibold select-text">
            {data()}
          </span>
          <Show when={status()}>
            {(level) => (
              <span
                class={`mt-0.5 text-[11px] leading-4 font-bold ${
                  statusClass(level())
                }`}
              >
                {level()}
              </span>
            )}
          </Show>
        </span>
      </div>
      <Show when={toSend()}>
        {(amount) => (
          <TokenNote
            icon={
              <ArrowRightIcon class={`size-full ${statusClass(status())}`} />
            }
          >
            Send wxHOPR worth at least{" "}
            <span class="cursor-text font-figures font-bold text-text-primary select-text">
              {amount()}
            </span>
          </TokenNote>
        )}
      </Show>
      <Show when={status() === "Sufficient"}>
        <TokenNote icon={<CheckCircleIcon class="size-full text-ok-badge" />}>
          You have enough wxHOPR
        </TokenNote>
      </Show>
    </div>
  );
}
