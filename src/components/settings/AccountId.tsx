import { createSignal, onCleanup } from "solid-js";
import { logWarn } from "@src/utils/appLog.ts";
import SettingIcon from "@src/components/icons/SettingIcon.tsx";

/** The node's address with an icon-only copy button. */
export default function AccountId(props: { address: string }) {
  const [copied, setCopied] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copyTimeout));

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.address);
      setCopied(true);
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      logWarn(`Error copying account ID: ${String(e)}`);
    }
  }

  return (
    <div class="flex shrink-0 flex-col gap-1 rounded-xl bg-bg-list px-3.5 py-3">
      <span class="text-xs leading-4 text-text-subtle">Account ID</span>
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 cursor-text font-figures text-[11px] leading-4 break-all text-address-ink select-text">
          {props.address}
        </span>
        <button
          type="button"
          class="inline-flex size-6.5 shrink-0 items-center justify-center rounded-[7px] bg-control-bg text-text-soft hover:cursor-pointer hover:bg-control-bg-hover"
          aria-label={copied() ? "Copied" : "Copy account ID"}
          title={copied() ? "Copied" : "Copy"}
          onClick={() => void copy()}
        >
          <SettingIcon name={copied() ? "check" : "copy"} size={14} />
        </button>
      </div>
    </div>
  );
}
