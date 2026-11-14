import { For } from "solid-js";
import { type CreditLine, formatCreditPrecise } from "@src/utils/credit.ts";
import { humanWxhoprParts } from "@src/utils/hopli.ts";

const ROW_CLASS: Record<CreditLine["kind"], string> = {
  part: "text-text-soft",
  sum: "border-t border-border font-semibold text-text-primary",
  aside: "border-t border-dashed border-border text-text-subtle italic",
};

/** Each allocation's data and wxHOPR, the totals without and with the PIX pool, and the pool at the PIX price outside the totals. */
export default function BalanceBreakdown(props: { lines: CreditLine[] }) {
  return (
    <div class="flex shrink-0 flex-col rounded-xl bg-bg-list px-3.5 py-3">
      <table class="w-full text-[13px] leading-5">
        <caption class="pb-1.5 text-left text-xs leading-4 text-text-subtle">
          Balance breakdown
        </caption>
        <thead>
          <tr class="text-xs leading-4 text-text-subtle">
            <th scope="col" class="pb-1 text-left font-normal">Allocation</th>
            <th scope="col" class="pb-1 text-right font-normal">Data</th>
            <th scope="col" class="pb-1 pl-3 text-right font-normal">
              wxHOPR
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={props.lines}>
            {(line) => (
              <tr class={ROW_CLASS[line.kind]}>
                <th
                  scope="row"
                  class="py-0.5 text-left whitespace-nowrap"
                  classList={{ "font-normal": line.kind !== "sum" }}
                >
                  {line.label}
                </th>
                <td class="py-0.5 text-right font-figures whitespace-nowrap tabular-nums">
                  {formatCreditPrecise(line.bytes)}
                </td>
                <td class="py-0.5 pl-3 text-right font-figures whitespace-nowrap tabular-nums">
                  {humanWxhoprParts(line.stake).amount}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
