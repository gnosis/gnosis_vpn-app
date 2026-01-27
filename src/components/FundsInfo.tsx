import { Show } from "solid-js";
import { fromWeiToFixed } from "../utils/units.ts";

type Props = {
  name?: string;
  subtitle?: string;
  balance?: string;
  ticker?: string;
  address?: string;
  status?: "Sufficient" | "Low" | "Empty" | string | null;
  isLoading?: boolean;
};

export default function FundsInfo(props: Props) {
  return (
    <div class="flex h-6 flex-row gap-1 w-full items-center">
      <Show
        when={!props.isLoading}
        fallback={
          <span class="h-6 w-1/3 rounded bg-sky-600/15 animate-pulse" />
        }
      >
        <span class="font-semibold w-1/3 text-right">
          {fromWeiToFixed(props.balance ?? "0")}
        </span>
      </Show>

      <div class="flex flex-row items-center gap-2 w-2/3 justify-between px-2">
        <span class="text-text-secondary">{props.ticker}</span>
        <Show
          when={!props.isLoading && props.status}
          fallback={props.isLoading
            ? <span class="h-6 w-20 rounded bg-slate-200 animate-pulse" />
            : null}
        >
          <span
            class={`font-bold text-xs ${
              props.status === "Sufficient"
                ? "text-emerald-600"
                : props.status === "Empty"
                ? "text-red-600"
                : "text-amber-600"
            }
              `}
          >
            {props.status}
          </span>
        </Show>
      </div>
    </div>
  );
}
