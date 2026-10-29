import { For } from "solid-js";
import type { RouteGrade } from "@src/utils/destinations.ts";

const BAR_COUNT = 4;

/** Same green/orange/red ramp as the graded stats, keyed on the filled count. */
const BAND_COLOR: Record<1 | 2 | 3 | 4, string> = {
  4: "text-text-green",
  3: "text-text-green",
  2: "text-text-orange",
  1: "text-text-red",
};

function filledBars(grade: RouteGrade): number {
  switch (grade.kind) {
    case "measured":
      return grade.bars;
    case "weak":
    case "none":
      // One bar keeps the column aligned; the colour says why it is one.
      return 1;
    case "unmeasured":
      return 0;
  }
}

function filledColor(grade: RouteGrade): string {
  switch (grade.kind) {
    case "measured":
      return BAND_COLOR[grade.bars];
    case "weak":
      return "text-text-orange";
    case "none":
      return "text-text-red";
    case "unmeasured":
      return "text-text-muted";
  }
}

/**
 * Four rising bars for a route grade. Decorative: the row or tooltip around it
 * carries the words. On a highlighted row the bars take the highlight's
 * foreground, filled solid and empty translucent.
 */
export default function SignalBars(props: {
  grade: RouteGrade;
  highlighted?: boolean;
  class?: string;
}) {
  const filled = () => filledBars(props.grade);
  const pulsing = () => props.grade.kind === "unmeasured";
  const barClass = (i: number) => {
    if (props.highlighted) {
      return i < filled() ? "text-accent-text" : "text-accent-text/35";
    }
    if (pulsing()) return "text-text-muted/60";
    return i < filled() ? filledColor(props.grade) : "text-text-muted/40";
  };

  return (
    <svg
      width="16"
      height="12"
      viewBox="0 0 16 12"
      class={`shrink-0 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <For each={Array.from({ length: BAR_COUNT }, (_, i) => i)}>
        {(i) => {
          const height = 3 * (i + 1);
          return (
            <rect
              x={i * 4}
              y={12 - height}
              width="3"
              height={height}
              rx="0.5"
              fill="currentColor"
              class={`transition-colors duration-200 ${barClass(i)} ${
                pulsing() ? "bars-pulse" : ""
              }`}
              style={pulsing()
                ? { "animation-delay": `${i * 200}ms` }
                : undefined}
            />
          );
        }}
      </For>
    </svg>
  );
}
