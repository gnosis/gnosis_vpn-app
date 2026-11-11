import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  exitsCovered,
  formatCreditCompact,
  MB_PER_EXIT,
} from "@src/utils/credit.ts";
import { openSettings, type SettingsTarget } from "@src/utils/settingsPage.ts";

type Props = {
  show: boolean;
  /** Data left; null while unknown or hidden from a non-owner. */
  credit: bigint | null;
  buttonRect: DOMRect | null;
  containerRect: DOMRect | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** The popover is left behind for the Settings page. */
  onNavigate: () => void;
};

function enoughFor(creditBytes: bigint): string {
  const exits = exitsCovered(creditBytes);
  return `Enough for ${exits} more ${
    exits === 1n ? "exit" : "exits"
  } at ${MB_PER_EXIT} MB each.`;
}

export default function BalancePopup(props: Props) {
  const go = (target: SettingsTarget) => {
    props.onNavigate();
    openSettings(target);
  };

  return (
    <Show when={props.show && props.buttonRect && props.containerRect}>
      <Portal>
        <div
          role="dialog"
          aria-label="Balance"
          class="fixed z-100 flex w-63 flex-col gap-2 rounded-[10px] bg-bg-popover p-3 text-text-primary shadow-popover"
          style={{
            top: `${props.buttonRect!.bottom + 6}px`,
            right: `${globalThis.innerWidth - props.containerRect!.right}px`,
          }}
          onMouseEnter={props.onMouseEnter}
          onMouseLeave={props.onMouseLeave}
        >
          <span class="text-[9px] font-bold uppercase tracking-[0.12em] text-text-subtle">
            Balance
          </span>
          <span class="font-figures text-[28px] leading-[normal] font-semibold tracking-[-0.02em]">
            {props.credit === null ? "—" : formatCreditCompact(props.credit)}
          </span>
          {/* Explicit null check: credit can be 0n, which Show treats as falsy */}
          <Show when={props.credit !== null}>
            <span class="text-[11px] leading-[16.5px] text-text-subtle">
              {enoughFor(props.credit!)}
            </span>
          </Show>
          <button
            type="button"
            class="h-8.5 w-full rounded-[9px] bg-control-bg hover:bg-control-bg-hover text-[12.5px] font-bold hover:cursor-pointer"
            onClick={() => go("add-funds")}
          >
            Add data
          </button>
          <button
            type="button"
            class="self-center py-0.5 text-xs text-text-subtle hover:text-text-primary hover:cursor-pointer"
            onClick={() => go("usage")}
          >
            Usage details
          </button>
        </div>
      </Portal>
    </Show>
  );
}
