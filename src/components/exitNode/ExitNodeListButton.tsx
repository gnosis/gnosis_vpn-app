import ListIcon from "../icons/ListIcon.tsx";

// Marked with data-exit-list-trigger so LocationBanner's pointerdown handler
// can skip setPointerCapture for this button — see LocationBanner.tsx.
export default function ExitNodeListButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-exit-list-trigger
      aria-label="Show exit node list"
      class="shrink-0 inline-flex items-center justify-center py-3 px-7 rounded-xl bg-accent hover:bg-accent-hover text-accent-text transition-transform duration-150 ease-out active:scale-95 select-none hover:cursor-pointer"
      onClick={props.onClick}
    >
      <ListIcon class="w-3 h-3" />
    </button>
  );
}
