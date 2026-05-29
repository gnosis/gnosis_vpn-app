import { Show } from "solid-js";
import { formatXdai } from "../utils/hopli.ts";

type Props = {
  name?: string;
  subtitle?: string;
  balance?: string;
  format?: (value: string) => string;
  ticker?: string;
  address?: string;
  status?: "Sufficient" | "Low" | "Empty" | string | null;
  isLoading?: boolean;
};

function StatusBadge(props: { status: string }) {
  const color = props.status === "Sufficient"
    ? "text-emerald-600"
    : props.status === "Empty"
    ? "text-red-600"
    : "text-amber-600";
  return <span class={`font-bold text-xs ${color}`}>{props.status}</span>;
}

export default function FundsInfo(props: Props) {
  const formatted = () => (props.format ?? formatXdai)(props.balance ?? "0");

  return (
    <div class="flex h-6 flex-row gap-1 w-full items-center justify-between">
      <Show
        when={!props.isLoading}
        fallback={<span class="h-6 w-1/3 rounded bg-sky-600/15 animate-pulse" />}
      >
        <span class="font-semibold font-mono">
          {formatted()}
          <Show when={!props.format}>
            <span class="text-text-secondary font-normal ml-2">{props.ticker}</span>
          </Show>
        </span>
      </Show>

      <Show
        when={!props.isLoading && props.status}
        fallback={props.isLoading
          ? <span class="h-6 w-20 rounded bg-slate-200 animate-pulse" />
          : null}
      >
        <StatusBadge status={props.status!} />
      </Show>
    </div>
  );
}
