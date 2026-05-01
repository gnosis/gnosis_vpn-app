/** Small inline route icon: dots connected by a line. */
export default function HopsIcon(
  props: { count: number; hideCount?: boolean },
) {
  return (
    <span
      class="inline-flex items-center gap-0.5"
      title={`${props.count}-hop${props.count !== 1 ? "s" : ""}`}
    >
      <svg
        width="18"
        height="12"
        viewBox="0 0 18 12"
        class="shrink-0"
        aria-hidden="true"
      >
        <circle cx="2" cy="6" r="2" fill="currentColor" />
        <rect
          x="5"
          y="5.25"
          width="2"
          height="1.5"
          rx="0.5"
          fill="currentColor"
        />
        <circle cx="9" cy="6" r="1" fill="currentColor" />
        <rect
          x="11"
          y="5.25"
          width="2"
          height="1.5"
          rx="0.5"
          fill="currentColor"
        />
        <circle cx="16" cy="6" r="2" fill="currentColor" />
      </svg>
      {!props.hideCount && (
        <span class="text-[10px] tabular-nums">{props.count}</span>
      )}
    </span>
  );
}
