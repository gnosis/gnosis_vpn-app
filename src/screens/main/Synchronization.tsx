import { createMemo, createSignal } from "solid-js";
import syncIcon from "@assets/icons/sync.svg";
import { useAppStore } from "@src/stores/appStore.ts";

export default function Synchronization() {
  const [state] = useAppStore();
  const [maxProgress, setMaxProgress] = createSignal(0);
  const progressPct = createMemo(() => {
    const rm = state.runMode;
    let raw = 0;
    if (rm && typeof rm === "object" && "Warmup" in rm) {
      const v = rm.Warmup.sync_progress;
      raw = typeof v === "number" ? v : 0;
    }
    const clamped = Math.max(0, Math.min(1, raw));
    const prev = maxProgress();
    const next = Math.max(prev, clamped);
    if (next !== prev) setMaxProgress(next);
    return Math.round(next * 100);
  });

  return (
    <div class="h-full w-full flex flex-col items-center p-6">
      <h1 class="w-full text-2xl font-bold text-center my-6">
        Initial Synchronization
      </h1>
      <img
        src={syncIcon}
        alt="Synchronization"
        class="w-1/3 mb-8 animate-spin-tick"
      />
      <div>{progressPct()}%</div>
      <div class="text-sm text-gray-500">This can take up to 10 minutes</div>
    </div>
  );
}
