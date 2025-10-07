import { createSignal } from "solid-js";
import { useLogsStore } from "@src/stores/logsStore";
import { explorerUrl } from "@src/utils/explorerUrl";
import { shortAddress } from "@src/utils/shortAddress";
import QrCode from "@src/components/QrCode";
import linkIcon from "@assets/icons/link.svg";
import copyIcon from "@assets/icons/copy.svg";
import qrIcon from "@assets/icons/qr.png";
import { getEthAddress } from "@src/utils/address";

export default function FundingAddress(props: { address: string }) {
  const [showQR, setShowQR] = createSignal(false);

  const [, logActions] = useLogsStore();
  const log = (message: string) => logActions.append(message);

  function openQR() {
    setShowQR(true);
  }

  async function copy(addr = props.address) {
    try {
      await navigator.clipboard.writeText(addr);
    } catch (error) {
      log(`Error copying address: ${String(error)}`);
    }
  }

  const address = getEthAddress(props.address);

  return (
    <>
      <div class="flex flex-row justify-between items-center">
        <div class="text-sm">
          <div class="font-bold">Funding Address</div>
          <button
            class="font-mono"
            onClick={() => copy()}
            title="Copy address"
            type="button"
          >
            {shortAddress(address)}
          </button>
        </div>

        <div class="flex gap-1 items-center">
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
            title="Copy address"
            type="button"
          >
            <img src={copyIcon} height={20} width={20} alt="Copy address" />
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
        title={shortAddress(address)}
        size={256}
      />
    </>
  );
}
