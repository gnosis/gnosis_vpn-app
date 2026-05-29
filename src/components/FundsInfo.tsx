import { Show } from "solid-js";

type Props = {
  amount: string;
  unit: string;
  status?: "Sufficient" | "Low" | "Empty" | string | null;
};

export default function FundsInfo(props: Props) {
  const statusColor = () =>
    props.status === "Sufficient"
      ? "text-emerald-600"
      : props.status === "Empty"
      ? "text-red-600"
      : "text-amber-600";

  return (
    <div class="flex flex-row items-baseline justify-between w-full">
      <div class="flex items-baseline gap-2">
        <span class="font-semibold font-mono">{props.amount}</span>
        <span class="font-semibold">{props.unit}</span>
      </div>
      <Show when={props.status}>
        <span class={`font-bold text-xs ${statusColor()}`}>{props.status}</span>
      </Show>
    </div>
  );
}
