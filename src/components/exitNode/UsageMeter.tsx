import { Match, Show, Switch } from "solid-js";
import { connectionPix } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { dataLeftFraction, formatDataLeft } from "@src/utils/credit.ts";

/** The live tunnel's data left of the PIX chunks it bought; `hideStatus` keeps it one fixed height. */
export default function UsageMeter(
  props: { class?: string; hideStatus?: boolean },
) {
  const [appState] = useAppStore();

  const pix = () => connectionPix(appState.connection);

  return (
    <Show when={pix()}>
      {(stats) => (
        // Spans: the advanced card nests the meter in a button
        <span class={`flex w-full flex-col gap-2 ${props.class ?? ""}`}>
          <span class="flex items-center justify-between gap-2">
            <span class="text-[13px] leading-5 text-text-soft">Usage</span>
            <span class="text-[13px] leading-5 text-text-subtle">
              <span
                class="font-figures text-[15px] leading-5 font-semibold"
                classList={{
                  "text-text-primary": stats().phase !== "payment_failed",
                  "text-text-red": stats().phase === "payment_failed",
                }}
              >
                {formatDataLeft(stats())}
              </span>{" "}
              {stats().phase === "free" ? "allowance" : "left"}
            </span>
          </span>
          <span class="block h-2 overflow-hidden rounded bg-control-bg">
            {/* A live fraction, which no utility class can express */}
            <span
              class="block h-full rounded bg-control-tint transition-[width] duration-500"
              style={{ width: `${dataLeftFraction(stats()) * 100}%` }}
            />
          </span>
          <Show when={!props.hideStatus}>
            <Switch>
              <Match when={stats().phase === "payment_failed"}>
                <span role="status" class="text-xs text-text-red">
                  Payment for more data failed
                </span>
              </Match>
              <Match when={stats().phase === "payment_pending"}>
                <span role="status" class="text-xs text-text-subtle">
                  Paying for more data…
                </span>
              </Match>
            </Switch>
          </Show>
        </span>
      )}
    </Show>
  );
}
