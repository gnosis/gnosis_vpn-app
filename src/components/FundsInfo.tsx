import FundingAddress from "@src/components/FundingAddress";
import { Show } from "solid-js";

type Props = {
  name?: string;
  subtitle?: string;
  balance?: string;
  ticker?: string;
  address?: string;
  status?: "Sufficient" | "Low" | "Empty" | string;
  isLoading?: boolean;
};

export default function FundsInfo(props: Props) {
  return (
    <div class="border border-black/10 px-4 py-2 text-slate-900 w-md h-32">
      <div class="flex flex-col gap-1 h-full">
        <div class="flex flex-row justify-between w-full">
          <div class="flex flex-row gap-1 items-baseline">
            <div class="font-semibold">{props.name}</div>
            <span class="text-sm text-slate-600">{props.subtitle}</span>
          </div>

          <Show
            when={!props.isLoading}
            fallback={
              <div class="h-5 w-20 rounded bg-slate-200 animate-pulse" />
            }
          >
            <span
              class={`font-extrabold ${
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
        <div class="">
          {/* <span class="font-medium">{props.ticker}</span> */}
          <Show
            when={!props.isLoading}
            fallback={
              <div class="h-6 w-32 rounded bg-sky-600/15 animate-pulse" />
            }
          >
            <span class="text-sky-600 font-semibold">{props.balance}</span>
          </Show>
        </div>

        <div class="grow"></div>
        <Show
          when={!props.isLoading}
          fallback={
            <div class="flex flex-col gap-2 animate-pulse">
              <div class="h-4 w-full rounded bg-slate-200" />
              <div class="h-4 w-2/3 rounded bg-slate-200" />
            </div>
          }
        >
          <FundingAddress address={props.address} full />
        </Show>
      </div>
    </div>
  );
}
