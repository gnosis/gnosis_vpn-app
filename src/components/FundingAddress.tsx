import { createSignal } from "solid-js";
import { useLogsStore } from "@src/stores/logsStore";
import { explorerUrl } from "@src/utils/explorerUrl";
import { shortAddress } from "@src/utils/shortAddress";
import QrCode from "@src/components/QrCode";
import linkIcon from "@assets/icons/link.svg";
import copyIcon from "@assets/icons/copy.svg";
import qrIcon from "@assets/icons/qr.png";
import checkIcon from "@assets/icons/checked-box.svg";
import { getEthAddress } from "@src/utils/address";

export default function FundingAddress(
  props: { address: string | undefined; full?: boolean; title?: string },
) {
  const raw = (props.address ?? "").trim();
  const isMissing = raw.length === 0 || raw.toLowerCase() === "unknown";

  let safeAddress: string | undefined;
  if (!isMissing) {
    try {
      safeAddress = getEthAddress(raw);
    } catch {
      safeAddress = undefined;
    }
  }

  if (!safeAddress) {
    return <div class="text-sm text-red-500">No funding address found</div>;
  }

  const [showQR, setShowQR] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const [, logActions] = useLogsStore();
  const log = (message: string) => logActions.append(message);

  function openQR() {
    setShowQR(true);
  }

  async function copy(addr = safeAddress) {
    try {
      await navigator.clipboard.writeText(addr ?? "");
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      log(`Error copying address: ${String(error)}`);
    }
  }

  const address = safeAddress;

  return (
    <>
      <div class="flex flex-row justify-between items-center">
        <div class="text-sm">
          <div class="font-bold">Funding Address</div>
          <button
            class="font-mono text-xs"
            onClick={() => copy()}
            title="Copy address"
            type="button"
          >
            {props.full ? address : shortAddress(address)}
          </button>
        </div>

        <div class="flex gap-1 items-center h-[20px]">
          <a
            href={explorerUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 p-1 hover:cursor-pointer"
            title="Open on Gnosisscan"
          >
            <img
              src={linkIcon}
              height={20}
              width={20}
              alt="Open on Gnosisscan"
            />
          </a>

          <button
            class="inline-flex items-center gap-1 p-1 hover:cursor-pointer"
            onClick={() => copy()}
            title={copied() ? "Copied" : "Copy address"}
            type="button"
          >
            <img
              src={copied() ? checkIcon : copyIcon}
              height={20}
              width={20}
              alt={copied() ? "Copied" : "Copy address"}
            />
          </button>

          <button
            class="inline-flex items-center gap-1 p-1 hover:cursor-pointer"
            onClick={openQR}
            title="Show QR"
            type="button"
          >
            <img src={qrIcon} height={20} width={20} alt="Show QR" />
          </button>
        </div>
      </div>
      <QrCode
        open={showQR()}
        onClose={() => setShowQR(false)}
        value={address}
        title={`${props.title ?? "Funding Address"} ${shortAddress(address)}`}
        size={256}
      />
    </>
  );
}
