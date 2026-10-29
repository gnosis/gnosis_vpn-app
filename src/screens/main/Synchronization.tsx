import { Show } from "solid-js";
import SyncAnimation from "@src/components/SyncAnimation.tsx";

export interface SynchronizationProps {
  syncProgress: number;
  recoveryReason?: string | null;
}

export default function Synchronization(props: SynchronizationProps) {
  // Floored so it never reads 100% before the screen moves on.
  const progress = () => Math.floor(Math.min(100, props.syncProgress));

  return (
    <div class="h-full w-full flex flex-col p-6 bg-bg-primary text-text-primary overflow-y-auto">
      <h1 class="text-4xl font-bold">Discovering the network</h1>

      <div class="flex flex-col items-center pt-12">
        <span class="text-xs font-bold uppercase tracking-widest text-text-secondary">
          Progress
        </span>
        <span class="text-3xl font-bold tabular-nums">{progress()}%</span>
      </div>

      <Show when={props.recoveryReason}>
        <p class="text-center text-sm text-text-secondary mt-6 opacity-80">
          Oh snap, something seems wrong, waiting for recovery
        </p>
      </Show>

      <div class="grow flex flex-col justify-center pt-8">
        <h3 class="text-xs font-bold uppercase tracking-widest text-text-secondary mb-2">
          How it works
        </h3>
        <SyncAnimation />
      </div>
    </div>
  );
}
