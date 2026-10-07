import ListIcon from "../icons/ListIcon.tsx";
import Tooltip from "../common/Tooltip.tsx";

export default function ExitNodeListButton(props: {
  // Reports the button's viewport center Y so the list can expand from it.
  onClick: (originY: number) => void;
}) {
  return (
    <Tooltip content="Exit list" triggerClass="w-fit shrink-0">
      <button
        type="button"
        aria-label="Change destination"
        class="shrink-0 inline-flex items-center justify-center py-3 px-7 rounded-xl bg-accent hover:bg-accent-hover text-accent-text transition-transform duration-150 ease-out active:scale-95 select-none hover:cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          props.onClick(rect.top + rect.height / 2);
        }}
      >
        <ListIcon class="w-[22px] h-3.5" />
      </button>
    </Tooltip>
  );
}
