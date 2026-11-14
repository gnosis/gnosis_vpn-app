import { Show } from "solid-js";
import Button from "@src/components/common/Button.tsx";
import GnosisVpnLogoTwoTone from "@src/components/common/GnosisVpnLogoTwoTone.tsx";
import SettingIcon from "@src/components/icons/SettingIcon.tsx";

/** First onboarding screen: why to fund, and the two ways to do it. */
export default function Fund(props: {
  disabled: boolean;
  waiting: boolean;
  onSendFunds: () => void;
  onOpenFundingSite: () => void;
}) {
  return (
    <div class="flex h-full w-full flex-col px-4 pt-4 pb-6">
      <div class="flex flex-col items-start gap-2.5 px-1 pt-3.5">
        <GnosisVpnLogoTwoTone class="mb-3.5 w-[190px] text-logo-ink" />
        <h1 class="text-[26px] leading-tight font-bold text-balance">
          Fund your VPN
        </h1>
        <p class="max-w-[300px] text-[13.5px] leading-normal text-pretty text-text-subtle">
          Your funds pay the independent nodes that carry your traffic. Once
          they arrive, we find your best route.
        </p>
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
        <button
          type="button"
          class="flex h-10.5 w-full cursor-pointer items-center justify-center rounded-[9px] bg-bg-list text-[13px] font-bold shadow-[inset_0_0_0_1px_var(--color-control-ring)] hover:bg-control-bg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-bg-list"
          disabled={props.disabled}
          onClick={() => props.onSendFunds()}
        >
          {/* Unica77 draws its glyphs high in the line box */}
          <span class="translate-y-px">Send funds directly</span>
        </button>
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
