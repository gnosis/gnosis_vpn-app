import { createEffect, createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import QRCode from "qrcode";
import { useLogsStore } from "../stores/logsStore.ts";

type QrCodeProps = {
  open: boolean;
  onClose: () => void;
  value: string;
  size?: number;
  title?: string;
};

export default function QrCode(props: QrCodeProps) {
  const [qrDataUrl, setQrDataUrl] = createSignal<string | undefined>();

  const [, logActions] = useLogsStore();
  const log = (message: string) => logActions.append(message);

  createEffect(async () => {
    if (!props.open) return;
    if (!props.value) {
      setQrDataUrl(undefined);
      return;
    }
    try {
      const url = await QRCode.toDataURL(props.value, {
        margin: 1,
        width: props.size ?? 256,
      });
      setQrDataUrl(url);
    } catch (error) {
      log(`Error generating QR code: ${String(error)}`);
      setQrDataUrl(undefined);
    }
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={props.onClose}
        >
          <div
            class="rounded-xl bg-white p-4 shadow-xl w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between mb-2">
              <div class="text-sm text-slate-600">{props.title}</div>
              <button
                class="rounded-md px-2 py-1 text-sm hover:bg-slate-100"
                onClick={props.onClose}
                aria-label="Close"
                type="button"
              >
                ✕
              </button>
            </div>
            <div class="flex flex-col items-center gap-3">
              <Show when={qrDataUrl()}>
                <img
                  src={qrDataUrl()}
                  alt="QR Code"
                  class="h-56 w-56"
                />
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
