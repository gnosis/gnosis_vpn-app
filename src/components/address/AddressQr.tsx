import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import QRCodeGenerator from "qrcode";
import { logWarn } from "@src/utils/appLog.ts";

/** The address as a plain QR code, redrawn for the current theme. */
export default function AddressQr(props: { address: string; sizePx: number }) {
  const [dataUrl, setDataUrl] = createSignal<string | undefined>();
  const [isDark, setIsDark] = createSignal(
    document.documentElement.classList.contains("dark"),
  );

  createEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    const dark = isDark();
    const address = props.address;
    if (!address) {
      setDataUrl(undefined);
      return;
    }
    QRCodeGenerator.toDataURL(address, {
      margin: 1,
      width: props.sizePx * 2,
      color: {
        dark: dark ? "#ffffff" : "#000000",
        light: dark ? "#00000000" : "#ffffff",
      },
    })
      .then(setDataUrl)
      .catch((error) => {
        logWarn(`Address QR: error generating code: ${String(error)}`);
        setDataUrl(undefined);
      });
  });

  return (
    <Show when={dataUrl()}>
      {(url) => (
        <img
          src={url()}
          alt="QR code of the address"
          class="shrink-0"
          style={{ width: `${props.sizePx}px`, height: `${props.sizePx}px` }}
        />
      )}
    </Show>
  );
}
