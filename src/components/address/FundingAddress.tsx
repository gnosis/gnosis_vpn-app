import { createSignal, onCleanup } from "solid-js";
import { useLogsStore } from "../../stores/logsStore.ts";
import { explorerUrl } from "../../utils/explorerUrl.ts";
import { shortAddress } from "../../utils/shortAddress.ts";
import QrCode from "./QrCode.tsx";
import linkIcon from "@assets/icons/link.svg";
import copyIcon from "@assets/icons/copy.svg";
import qrIcon from "@assets/icons/qr.png";
import checkIcon from "@assets/icons/checked-box.svg";
import * as opener from "@tauri-apps/plugin-opener";
import Tooltip from "../common/Tooltip.tsx";

export default function FundingAddress(
  props: { address: string | undefined; full?: boolean; title?: string },
) {
  const raw = (props.address ?? "").trim();
  const isMissing = raw.length === 0 || raw.toLowerCase() === "unknown";

  if (isMissing) {
    return <div class="text-sm text-red-500">No Gnosis VPN address found</div>;
  }

  const safeAddress: string = raw;

  const [showQR, setShowQR] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (copyTimeout !== undefined) clearTimeout(copyTimeout);
  });

  const [, logActions] = useLogsStore();
  const log = (message: string) => logActions.append(message);

  function openQR() {
    setShowQR(true);
  }

  async function copy(addr = safeAddress) {
    try {
      await navigator.clipboard.writeText(addr ?? "");
      setCopied(true);
      if (copyTimeout !== undefined) clearTimeout(copyTimeout);
      copyTimeout = globalThis.setTimeout(() => {
        setCopied(false);
        copyTimeout = undefined;
      }, 1500);
    } catch (error) {
      log(`Error copying address: ${String(error)}`);
    }
  }

  async function openExplorer() {
    try {
      await opener.openUrl(explorerUrl(address));
    } catch (error) {
      log(`Error opening explorer: ${String(error)}`);
    }
  }

  const address = safeAddress;

  return (
    <>
      <div class="flex flex-row justify-between items-center">
        <div class="text-sm">
          <div class="font-bold">Gnosis VPN address</div>
          <div class="font-mono text-lg">
            {props.full ? address : shortAddress(address)}
          </div>
        </div>

        <div class="flex gap-1 items-center h-[20px]">
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

          <Tooltip content="Show QR" position="top">
            <button
              class="inline-flex items-center gap-1 p-1 hover:cursor-pointer dark:invert"
              onClick={openQR}
              type="button"
            >
              <img src={qrIcon} height={20} width={20} alt="Show QR" />
            </button>
          </Tooltip>
        </div>
      </div>
      <QrCode
        open={showQR()}
        onClose={() => setShowQR(false)}
        value={address}
        title={props.title ?? "Gnosis VPN address"}
        size={256}
      />
    </>
  );
}
