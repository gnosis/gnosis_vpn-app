import ListIcon from "../icons/ListIcon.tsx";

// Marked with data-exit-list-trigger so LocationBanner's pointerdown handler
// can skip setPointerCapture for this button — see LocationBanner.tsx.
export default function ExitNodeListButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-exit-list-trigger
      aria-label="Show exit node list"
      class="shrink-0 h-8 w-11 rounded-2xl bg-accent hover:bg-accent-hover text-accent-text flex items-center justify-center transition-transform duration-150 ease-out active:scale-95 select-none hover:cursor-pointer"
      onClick={props.onClick}
    >
      <ListIcon class="w-4 h-3.5" />
    </button>
  );
}
