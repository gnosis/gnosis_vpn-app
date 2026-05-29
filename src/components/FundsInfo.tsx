import { Show } from "solid-js";

type Props = {
  amount: string;
  unit: string;
  status?: "Sufficient" | "Low" | "Empty" | string | null;
};

// Returns 3 bare grid cells — must be placed inside a grid-cols-3 parent.
export default function FundsInfo(props: Props) {
  const statusColor = () =>
    props.status === "Sufficient"
      ? "text-emerald-600"
      : props.status === "Empty"
      ? "text-red-600"
      : "text-amber-600";

  return (
    <>
      <span class="font-semibold font-mono text-right">{props.amount}</span>
      <span class="font-semibold">{props.unit}</span>
      <Show when={props.status}>
        <span class={`font-bold text-xs text-right ${statusColor()}`}>
          {props.status}
        </span>
      </Show>
    </>
  );
}
