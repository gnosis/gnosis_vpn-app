import { For } from "solid-js";

export type BarTone = "green" | "amber" | "red" | "muted";

const toneClass: Record<BarTone, string> = {
  green: "text-text-green",
  amber: "text-text-orange",
  red: "text-text-red",
  muted: "text-text-muted",
};

const BAR_COUNT = 3;

/** Three rising bars; `pulsing` scans them while a verdict is still pending. */
export default function QualityBars(props: {
  filled: number;
  tone: BarTone;
  pulsing?: boolean;
  label: string;
}) {
  return (
    <svg
      width="21"
      height="12"
      viewBox="0 0 21 12"
      class="shrink-0"
      role="img"
      aria-label={props.label}
    >
      <For each={Array.from({ length: BAR_COUNT }, (_, i) => i)}>
        {(i) => {
          const height = 4 * (i + 1);
          return (
            <rect
              x={i * 8}
              y={12 - height}
              width="5"
              height={height}
              rx="1"
              fill="currentColor"
              class={`transition-colors duration-300 ${
                i < props.filled ? toneClass[props.tone] : "text-text-muted/40"
              } ${props.pulsing ? "bars-scan" : ""}`}
              style={props.pulsing
                ? { "animation-delay": `${i * 150}ms` }
                : undefined}
            />
          );
        }}
      </For>
    </svg>
  );
}
