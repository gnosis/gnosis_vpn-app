import { createSignal, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import QRCode from 'qrcode';

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
  const [qrDataUrl, setQrDataUrl] = createSignal<string>();

  const short = (a: string) =>
    a?.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
  const gnosisScanUrl = () => `https://gnosisscan.io/address/${props.address}`;

  async function openQR() {
    const url = await QRCode.toDataURL(props.address, {
      margin: 1,
      width: 256,
    });
    setQrDataUrl(url);
    setShowQR(true);
  }

  async function copy(addr = props.address) {
    try {
      await navigator.clipboard.writeText(addr);
    } catch (error) {
      console.log(error);
    }
  }

  return (
    <div class="rounded-xl border border-black/10 p-3 bg-white text-slate-900 max-w-md min-w-xs">
      <div class="flex flex-col gap-3">
        <div class="flex flex-row justify-between w-full">
          <div class="flex flex-col gap-1">
            <div class="font-semibold">{props.name}</div>
            <span class="text-sm">{props.subtitle}</span>
          </div>

          <span
            class={`font-extrabold ${
              props.status === 'Sufficient'
                ? 'text-emerald-600'
                : 'text-amber-600'
            }
            `}
          >
            {props.status}
          </span>
        </div>
        <div class="mt-1">
          {/* <span class="font-medium">{props.ticker}</span> */}
          <span class="text-sky-600 font-semibold">{props.balance}</span>
        </div>

        <div class="flex flex-row justify-between items-center">
          <div class="mt-2 text-sm text-slate-600">
            <div class="">Funding Address</div>
            <button
              class="font-mono rounded-md px-2 py-1 bg-slate-100 hover:bg-slate-200"
              onClick={() => copy()}
              title="Copy address"
            >
              {short(props.address)}
            </button>
          </div>

          <div class="flex gap-1 items-center mt-2">
            <a
              href={gnosisScanUrl()}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-sm hover:bg-slate-50"
              title="Open on GnosisScan"
            >
              CHAIN
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

      <Show when={showQR()}>
        <Portal>
          <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowQR(false)}
          >
            <div
              class="rounded-xl bg-white p-4 shadow-xl w-xs"
              onClick={e => e.stopPropagation()}
            >
              <div class="flex items-center justify-between mb-2">
                <div class="text-sm text-slate-600">{short(props.address)}</div>
                <button
                  class="rounded-md px-2 py-1 text-sm hover:bg-slate-100"
                  onClick={() => setShowQR(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div class="flex flex-col items-center gap-3">
                <img src={qrDataUrl()} alt="Address QR" class="h-56 w-56" />
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
}
