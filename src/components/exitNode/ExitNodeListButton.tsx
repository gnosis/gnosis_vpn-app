import ChevronsUpDownIcon from "../icons/ChevronsUpDownIcon.tsx";

export default function ExitNodeListButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Change destination"
      class="shrink-0 inline-flex items-center justify-center py-3 px-7 rounded-xl bg-accent hover:bg-accent-hover text-accent-text transition-transform duration-150 ease-out active:scale-95 select-none hover:cursor-pointer"
      onClick={props.onClick}
    >
      <ChevronsUpDownIcon class="w-3 h-3.5" />
    </button>
  );
}
