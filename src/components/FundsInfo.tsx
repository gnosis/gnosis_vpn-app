import FundingAddress from "@src/components/FundingAddress";
import { Show } from "solid-js";
import FundsInfoSkeleton from "./FundsInfoSkeleton";

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
    <div class="rounded-xl border border-black/10 px-4 py-2 bg-white text-slate-900 w-xs h-32">
      <Show when={!props.isLoading} fallback={<FundsInfoSkeleton />}>
        <div class="flex flex-col gap-1 h-full">
          <div class="flex flex-row justify-between w-full">
            <div class="flex flex-row gap-1 items-baseline">
              <div class="font-semibold">{props.name}</div>
              <span class="text-sm text-slate-600">{props.subtitle}</span>
            </div>

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
          </div>
          <div class="">
            {/* <span class="font-medium">{props.ticker}</span> */}
            <span class="text-sky-600 font-semibold">{props.balance}</span>
          </div>

          <div class="flex-grow"></div>
          <FundingAddress address={props.address ?? ""} />
        </div>
      </Show>
    </div>
  );
}
