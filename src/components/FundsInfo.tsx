import { createSignal } from 'solid-js';
import QrCode from './QrCode';
import { shortAddress } from '../utils/shortAddress';
import { explorerUrl } from '../utils/explorerUrl';
import { useAppStore } from '../stores/appStore';

type Props = {
  name: string;
  subtitle: string;
  balance: string;
  ticker: string;
  address: string;
  status: 'Sufficient' | 'Low' | 'Empty' | string;
};

export default function FundsInfo(props: Props) {
  const [showQR, setShowQR] = createSignal(false);
  const [, appActions] = useAppStore();

  function openQR() {
    setShowQR(true);
  }

  async function copy(addr = props.address) {
    try {
      await navigator.clipboard.writeText(addr);
    } catch (error) {
      appActions.log(`Error copying address: ${String(error)}`);
    }
  }

  return (
    <div class="rounded-xl border border-black/10 px-4 py-2 bg-white text-slate-900 max-w-md min-w-xs">
      <div class="flex flex-col gap-1">
        <div class="flex flex-row justify-between w-full">
          <div class="flex flex-row gap-1 items-baseline">
            <div class="font-semibold">{props.name}</div>
            <span class="text-sm text-slate-600">{props.subtitle}</span>
          </div>

          <span
            class={`font-extrabold ${
              props.status === 'Sufficient'
                ? 'text-emerald-600'
                : props.status === 'Empty'
                  ? 'text-red-600'
                  : 'text-amber-600'
            }
            `}
          >
            {props.status}
          </span>
        </div>
        <div class="">
          {/* <span class="font-medium">{props.ticker}</span> */}
          <span class="text-sky-600 font-semibold">{props.balance}</span>
        </div>

        <div class="flex flex-row justify-between items-center">
          <div class="text-sm text-slate-600">
            <div class="">Funding Address</div>
            <button
              class="font-mono rounded-md px-2 py-1 bg-slate-100 hover:bg-slate-200"
              onClick={() => copy()}
              title="Copy address"
            >
              {shortAddress(props.address)}
            </button>
          </div>

          <div class="flex gap-1 items-center mt-2">
            <a
              href={explorerUrl(props.address)}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 p-1 hover:cursor-pointer"
              title="Open on Gnosisscan"
            >
              <img
                src="/icons/link.svg"
                height={20}
                width={20}
                alt="Open on Gnosisscan"
              />
            </a>

            <button
              class="inline-flex items-center gap-1 p-1 hover:cursor-pointer"
              onClick={() => copy()}
              title="Copy address"
            >
              <img
                src="/icons/copy.svg"
                height={20}
                width={20}
                alt="Copy address"
              />
            </button>

            <button
              class="inline-flex items-center gap-1 p-1 hover:cursor-pointer"
              onClick={openQR}
              title="Show QR"
            >
              <img src="/icons/qr.png" height={20} width={20} alt="Show QR" />
            </button>
          </div>
        </div>
      </div>

      <QrCode
        open={showQR()}
        onClose={() => setShowQR(false)}
        value={props.address}
        title={shortAddress(props.address)}
        size={256}
      />
    </div>
  );
}
