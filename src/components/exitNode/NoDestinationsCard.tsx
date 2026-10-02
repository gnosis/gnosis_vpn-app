/** Holds the banner's slot while the daemon reports no exit nodes, so the section never renders blank. */
export default function NoDestinationsCard() {
  return (
    <div class="w-full bg-bg-card-outer rounded-2xl p-1.5">
      <div class="flex w-full flex-col gap-4 rounded-2xl bg-bg-card px-3 py-3.5">
        <span class="text-xs text-text-secondary">Exit Node</span>
        <span class="text-xs font-semibold text-text-primary">
          No exit nodes available
        </span>
      </div>
      <p class="mt-1.5 pl-3 text-xs text-text-secondary">
        Checking for new ones…
      </p>
    </div>
  );
}
