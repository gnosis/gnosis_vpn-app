import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { logWarn } from "../../utils/appLog.ts";
import { explorerUrl } from "../../utils/explorerUrl.ts";
import { shortAddress } from "../../utils/shortAddress.ts";
import QrCode from "./QrCode.tsx";
import AddressQr from "./AddressQr.tsx";
import linkIcon from "@assets/icons/link.svg";
import copyIcon from "@assets/icons/copy.svg";
import qrIcon from "@assets/icons/qr.png";
import checkIcon from "@assets/icons/checked-box.svg";
import * as opener from "@tauri-apps/plugin-opener";
import Tooltip from "../common/Tooltip.tsx";

export default function FundingAddress(
  props: {
    address: string | undefined;
    full?: boolean;
    title?: string;
    qrVisible?: boolean;
    selectable?: boolean;
  },
) {
  const address = createMemo(() => (props.address ?? "").trim());
  const displayedAddress = () =>
    props.full ? address() : shortAddress(address());
  const isMissing = createMemo(() => {
    const a = address();
    return a.length === 0 || a.toLowerCase() === "unknown";
  });

  const [showQR, setShowQR] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    clearTimeout(copyTimeout);
  });

  async function copy(addr = address()) {
    try {
      await navigator.clipboard.writeText(addr ?? "");
      setCopied(true);
      clearTimeout(copyTimeout);
      copyTimeout = globalThis.setTimeout(() => {
        setCopied(false);
        copyTimeout = undefined;
      }, 1500);
    } catch (error) {
      logWarn(`Error copying address: ${String(error)}`);
    }
  }

  async function openExplorer() {
    try {
      await opener.openUrl(explorerUrl(address()));
    } catch (error) {
      logWarn(`Error opening explorer: ${String(error)}`);
    }
  }

  return (
    <Show
      when={!isMissing()}
      fallback={
        <div class="text-sm text-red-500">No Gnosis VPN address found</div>
      }
    >
      <div class="flex flex-row justify-between items-center gap-2">
        <div class="text-sm min-w-0">
          <div class="font-bold">Gnosis VPN address</div>
          <div
            class={`font-mono ${
              props.full ? "text-[10px] break-all" : "text-lg break-all"
            }`}
          >
            <Show when={props.selectable} fallback={displayedAddress()}>
              <span class="select-text cursor-text">{displayedAddress()}</span>
            </Show>
          </div>
        </div>

        <div class="flex gap-1 items-center shrink-0">
          <Show when={!props.qrVisible}>
            <Tooltip content="Open on Gnosisscan" position="top">
              <button
                onClick={openExplorer}
                class="inline-flex items-center gap-1 p-1 hover:cursor-pointer dark:invert"
                type="button"
              >
                <img
                  src={linkIcon}
                  height={20}
                  width={20}
                  alt="Open on Gnosisscan"
                />
              </button>
            </Tooltip>
          </Show>

          <Tooltip
            content={copied() ? "Copied" : "Copy address"}
            position="top"
          >
            <button
              class="inline-flex items-center gap-1 p-1 hover:cursor-pointer dark:invert"
              onClick={() => copy()}
              type="button"
            >
              <img
                src={copied() ? checkIcon : copyIcon}
                height={20}
                width={20}
                alt={copied() ? "Copied" : "Copy address"}
              />
            </button>
          </Tooltip>

          <Show when={!props.qrVisible}>
            <Tooltip content="Show QR" position="top">
              <button
                class="inline-flex items-center gap-1 p-1 hover:cursor-pointer dark:invert"
                onClick={() => setShowQR(true)}
                type="button"
              >
                <img src={qrIcon} height={20} width={20} alt="Show QR" />
              </button>
            </Tooltip>
          </Show>
        </div>
      </div>

      <Show when={props.qrVisible}>
        <div class="flex justify-center my-6">
          <AddressQr address={address()} sizePx={157} />
        </div>
      </Show>

      <QrCode
        open={showQR()}
        onClose={() => setShowQR(false)}
        value={address()}
        title={props.title ?? "Gnosis VPN address"}
        size={256}
      />
    </Show>
  );
}
