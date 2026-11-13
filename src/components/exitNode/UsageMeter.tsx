import { type JSX, Show } from "solid-js";
import { connectionPix } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { dataLeftFraction, formatDataLeft } from "@src/utils/credit.ts";

/** The live tunnel's data left of the PIX chunks it bought; with `keepBar`, an empty bar without a session. */
export default function UsageMeter(
  props: { label?: JSX.Element; keepBar?: boolean; class?: string },
) {
  const [appState] = useAppStore();

  const pix = () => connectionPix(appState.connection);
  const fraction = () => {
    const stats = pix();
    return stats ? dataLeftFraction(stats) : 0;
  };

  return (
    <Show when={pix() || props.keepBar}>
      {/* Spans: the advanced card nests the meter in a button */}
      <span class={`flex w-full flex-col gap-2 ${props.class ?? ""}`}>
        <span class="flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-text-soft">
            {props.label ?? "Usage"}
          </span>
          <Show when={pix()}>
            {(stats) => (
              <span class="shrink-0 text-[13px] leading-5 text-text-subtle">
                <span class="font-figures text-[15px] leading-5 font-semibold">
                  {formatDataLeft(stats())}
                </span>{" "}
                {stats().phase === "free" ? "allowance" : "left"}
              </span>
            )}
          </Show>
        </span>
        <span class="block h-2 overflow-hidden rounded bg-control-bg">
          {/* A live fraction, which no utility class can express */}
          <span
            class="block h-full rounded bg-control-tint transition-[width] duration-500"
            style={{ width: `${fraction() * 100}%` }}
          />
        </span>
      </span>
    </Show>
  );
}
