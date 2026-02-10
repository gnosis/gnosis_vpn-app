/** Small inline route icon: dots connected by a line. */
export default function HopsIcon(
  props: { count: number; hideCount?: boolean },
) {
  return (
    <span
      class="inline-flex items-center gap-0.5"
      title={`${props.count} hop${props.count !== 1 ? "s" : ""}`}
    >
      <svg
        width="16"
        height="12"
        viewBox="0 0 16 12"
        class="shrink-0"
        aria-hidden="true"
      >
        <circle cx="2" cy="6" r="2" fill="currentColor" />
        <line
          x1="4"
          y1="6"
          x2="12"
          y2="6"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-dasharray="2 2"
        />
        <circle cx="14" cy="6" r="2" fill="currentColor" />
      </svg>
      {!props.hideCount && (
        <span class="text-[10px] tabular-nums">{props.count}</span>
      )}
    </span>
  );
}
