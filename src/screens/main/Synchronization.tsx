import { createMemo, Show } from "solid-js";
import SyncAnimation from "@src/components/SyncAnimation.tsx";
import { syncProgressDigits } from "@src/utils/syncProgress.ts";

export interface SynchronizationProps {
  syncProgress: number;
  recoveryReason?: string | null;
}

export default function Synchronization(props: SynchronizationProps) {
  // A retry creeps 0.01%/s, invisible in whole percents; once one is seen, decimals stay for this sync screen.
  const withDecimals = createMemo(
    (seen: boolean) => seen || Boolean(props.recoveryReason),
    false,
  );
  const digits = () => syncProgressDigits(props.syncProgress, withDecimals());

  return (
    <div class="h-full w-full flex flex-col p-6 bg-bg-primary text-text-primary overflow-y-auto">
      <h1 class="text-4xl font-bold text-center">Discovering the network</h1>

      <div class="flex flex-col items-center pt-12">
        <span class="text-xs font-bold uppercase tracking-widest text-text-secondary">
          Progress
        </span>
        {/* tabular digits only: Unica77 widens "." to digit width too */}
        <span class="text-3xl font-bold">
          <span class="tabular-nums">{digits().whole}</span>
          <Show when={digits().fraction}>
            {(fraction) => (
              <>
                .<span class="tabular-nums">{fraction()}</span>
              </>
            )}
          </Show>
          %
        </span>
      </div>

      <div class="grow flex flex-col justify-center pt-8">
        <h3 class="text-xs font-bold uppercase tracking-widest text-text-secondary mb-2">
          How it works
        </h3>
        <SyncAnimation />
      </div>
    </div>
  );
}
