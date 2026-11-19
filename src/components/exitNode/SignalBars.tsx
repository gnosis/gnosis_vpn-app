import { For, Show } from "solid-js";
import type { RouteGrade } from "@src/utils/destinations.ts";
import CardTooltip from "./CardTooltip.tsx";

const BAR_COUNT = 4;

/** The status dot's green/orange/red, keyed on the filled count. */
const BAND_COLOR: Record<1 | 2 | 3 | 4, string> = {
  4: "text-status-ok",
  3: "text-status-ok",
  2: "text-status-warn",
  1: "text-status-bad",
};

function label(grade: RouteGrade): string {
  switch (grade.kind) {
    case "graded":
      return `Route ${grade.bars} of ${BAR_COUNT}, ${grade.percentOfBest}% of the best exit right now`;
    case "unmeasured":
      return "Route not graded yet";
    case "none":
      return "";
  }
}

/** Four rising bars; hollow while the exit is ungraded, so the count is honest without color. */
export default function SignalBars(props: {
  grade: RouteGrade;
  // no tooltip: inside a clickable area its anchor would swallow the click
  bare?: boolean;
}) {
  const filled = () => props.grade.kind === "graded" ? props.grade.bars : 0;
  const filledColor = () =>
    props.grade.kind === "graded"
      ? BAND_COLOR[props.grade.bars]
      : BAND_COLOR[1];
  const hollow = () => props.grade.kind === "unmeasured";
  const bars = () => (
    <svg
      width="22"
      height="12"
      viewBox="0 0 22 12"
      class="shrink-0"
      role="img"
      aria-label={label(props.grade)}
    >
      <For each={Array.from({ length: BAR_COUNT }, (_, i) => i)}>
        {(i) => {
          const height = 3 * (i + 1);
          const isFilled = () => i < filled();
          return (
            <rect
              x={i * 6}
              y={12 - height}
              width="4"
              height={height}
              rx="1"
              class={isFilled()
                ? filledColor()
                : hollow()
                ? "text-status-idle"
                : "text-bar-off"}
              fill={hollow() ? "none" : "currentColor"}
              stroke={hollow() ? "currentColor" : "none"}
              stroke-width="1"
            />
          );
        }}
      </For>
    </svg>
  );

  return (
    <Show when={props.grade.kind !== "none"}>
      <Show
        when={!props.bare}
        fallback={bars()}
      >
        <CardTooltip tooltip={`${label(props.grade)}.`}>{bars()}</CardTooltip>
      </Show>
    </Show>
  );
}
