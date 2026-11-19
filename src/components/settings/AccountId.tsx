import { createSignal, onCleanup } from "solid-js";
import { logWarn } from "@src/utils/appLog.ts";
import SettingIcon from "@src/components/icons/SettingIcon.tsx";
import SettingsRow from "@src/components/settings/SettingsRow.tsx";

/** The node's address on one line, with an icon-only copy button. */
export default function AccountId(
  props: { address: string; iconSlot?: boolean },
) {
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
    <SettingsRow
      iconSlot={props.iconSlot}
      title="Account ID"
      description={
        <span class="@container block">
          {/* 42 monospace glyphs at 0.6em fill 25.2em, so 3.9cqi keeps the address on one line */}
          <span class="block cursor-text overflow-hidden font-figures text-[length:clamp(8px,3.9cqi,11px)] leading-4 text-ellipsis whitespace-nowrap text-address-ink select-text">
            {props.address}
          </span>
        </span>
      }
    >
      <button
        type="button"
        class="inline-flex size-6.5 shrink-0 items-center justify-center rounded-[7px] bg-control-bg text-text-soft hover:cursor-pointer hover:bg-control-bg-hover"
        aria-label={copied() ? "Copied" : "Copy account ID"}
        title={copied() ? "Copied" : "Copy"}
        onClick={() => void copy()}
      >
        <SettingIcon name={copied() ? "check" : "copy"} size={14} />
      </button>
    </SettingsRow>
  );
}
