import FundingAddress from "@src/components/FundingAddress";

type Props = {
  name: string;
  subtitle: string;
  balance: string;
  ticker: string;
  address: string;
  status: "Sufficient" | "Low" | "Empty" | string;
};

export default function FundsInfo(props: Props) {
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

        <FundingAddress address={props.address} />
      </div>
    </div>
  );
}
