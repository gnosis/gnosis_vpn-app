import { createSignal, onCleanup } from "solid-js";
import { logWarn } from "@src/utils/appLog.ts";
import copyIcon from "@assets/icons/copy.svg";
import checkmarkIcon from "@assets/icons/checkmark.svg";

/** Monospace block with a copy-to-clipboard button. */
export default function CopyBlock(props: { text: string; label?: string }) {
  const [copied, setCopied] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(copyTimeout));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      clearTimeout(copyTimeout);
      copyTimeout = globalThis.setTimeout(() => {
        setCopied(false);
        copyTimeout = undefined;
      }, 1500);
    } catch (e) {
      // Clipboard can be unavailable (e.g. denied permissions); the text is
      // still visible for manual copy, so no UI error.
      logWarn(`Failed to copy ${props.label ?? "text"}: ${e}`);
    }
  };

  return (
    <div class="relative rounded-lg border border-border bg-[#12161c] overflow-hidden">
      <button
        type="button"
        onClick={copy}
        aria-label={copied() ? "Copied" : `Copy ${props.label ?? "text"}`}
        class="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/20 hover:cursor-pointer transition-colors"
      >
        <img
          src={copied() ? checkmarkIcon : copyIcon}
          width={14}
          height={14}
          alt=""
          class="invert"
        />
        {copied() ? "Copied" : "Copy"}
      </button>
      <pre class="overflow-x-auto px-3 py-3 pr-20 text-xs leading-relaxed font-mono text-gray-100">
        <code>{props.text}</code>
      </pre>
    </div>
  );
}
