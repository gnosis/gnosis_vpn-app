import { createUniqueId, For } from "solid-js";
import { type CreditLine, formatCreditPrecise } from "@src/utils/credit.ts";
import { formatXdai, humanWxhoprParts } from "@src/utils/hopli.ts";

const ROW_CLASS: Record<CreditLine["kind"], string> = {
  part: "text-text-soft",
  sum: "border-t border-border font-semibold text-text-primary",
};

/** The EOA's xDAI, then each allocation's data at the relay rate and at the PIX price, and its wxHOPR, with the totals without and with the PIX pool. */
export default function BalanceBreakdown(
  props: { lines: CreditLine[]; xdai: bigint },
) {
  const headingId = createUniqueId();
  return (
    <div class="flex shrink-0 flex-col rounded-xl bg-bg-list px-3.5 py-3">
      <span id={headingId} class="pb-1.5 text-xs leading-4 text-text-subtle">
        Balance breakdown
      </span>
      <p class="flex justify-between gap-3 border-b border-border pb-1.5 mb-1.5 text-[13px] leading-5 text-text-soft">
        <span>EOA xDAI</span>
        <span class="font-figures whitespace-nowrap tabular-nums">
          {formatXdai(props.xdai, 6)}
        </span>
      </p>
      <table class="w-full text-[13px] leading-5" aria-labelledby={headingId}>
        <thead>
          <tr class="text-xs leading-4 text-text-subtle">
            <th scope="col" class="pb-1 text-left font-normal">Allocation</th>
            <th scope="col" class="pb-1 text-right font-normal">Data</th>
            <th scope="col" class="pb-1 pl-3 text-right font-normal">
              At PIX price
            </th>
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
                  {line.bytes === null ? "—" : formatCreditPrecise(line.bytes)}
                </td>
                <td class="py-0.5 pl-3 text-right font-figures whitespace-nowrap tabular-nums">
                  {line.pixBytes === null
                    ? "—"
                    : formatCreditPrecise(line.pixBytes)}
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
