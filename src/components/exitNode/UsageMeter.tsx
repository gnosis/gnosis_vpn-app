import { MB_PER_EXIT } from "@src/utils/credit.ts";
import FeatureComing from "../settings/FeatureComing.tsx";

/** The tunnel's data left; greyed as coming until the client reports per-exit usage. */
export default function UsageMeter(props: { class?: string }) {
  return (
    <FeatureComing class="w-full">
      <div class={`flex w-full flex-col gap-2 opacity-50 ${props.class ?? ""}`}>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[13px] leading-5 text-text-soft">Usage</span>
          <span class="text-[13px] leading-5 text-text-subtle">
            <span class="font-figures text-[15px] leading-5 font-semibold text-text-primary">
              {`${MB_PER_EXIT} MB`}
            </span>{" "}
            left
            <span class="sr-only">, feature coming</span>
          </span>
        </div>
        <div class="h-2 overflow-hidden rounded bg-control-bg">
          <div class="h-full w-full rounded bg-control-tint" />
        </div>
      </div>
    </FeatureComing>
  );
}
