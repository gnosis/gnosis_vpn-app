import { type JSX, Show } from "solid-js";
import Tooltip from "./common/Tooltip.tsx";

type Props = {
  amount: string;
  unit: string;
  status?: "Sufficient" | "Low" | "Empty" | string | null;
  tooltip?: JSX.Element;
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
      <Show
        when={props.tooltip}
        fallback={
          <span class="font-semibold font-mono text-right">{props.amount}</span>
        }
      >
        <Tooltip content={props.tooltip} position="top">
          <span class="font-semibold font-mono text-right cursor-help">
            {props.amount}
          </span>
        </Tooltip>
      </Show>
      <span class="font-semibold">{props.unit}</span>
      <Show when={props.status}>
        <span class={`font-bold text-xs text-right ${statusColor()}`}>
          {props.status}
        </span>
      </Show>
    </>
  );
}
