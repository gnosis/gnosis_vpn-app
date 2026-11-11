import BackIcon from "../icons/BackIcon.tsx";

/** A full-window page's back button and title, as in the Stage 2.1 mock. */
export default function PageHeader(
  props: { title: string; onBack: () => void },
) {
  return (
    <div class="flex shrink-0 items-center gap-2 px-3 pt-3 pb-1.5">
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded-lg bg-control-bg hover:bg-control-bg-hover hover:cursor-pointer"
        aria-label="Back"
        onClick={() => props.onBack()}
      >
        <BackIcon />
      </button>
      <h1 class="text-base font-bold tracking-[-0.025em]">{props.title}</h1>
    </div>
  );
}
