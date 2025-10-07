export default function FundsInfoSkeleton() {
  return (
    <div class="animate-pulse flex flex-col justify-between gap-3 h-full">
      <div class="w-full">
        <div class="flex flex-row justify-between items-center w-full">
          <div class="flex flex-row items-baseline gap-2">
            <div class="h-4 w-28 rounded bg-slate-200" />
          </div>
          <div class="h-5 w-20 rounded bg-slate-200" />
        </div>

        <div class="h-6 w-32 mt-2 rounded bg-sky-200" />
      </div>

      <div class="flex flex-col gap-2">
        <div class="h-4 w-full rounded bg-slate-200" />
        <div class="h-4 w-2/3 rounded bg-slate-200" />
      </div>
    </div>
  );
}
