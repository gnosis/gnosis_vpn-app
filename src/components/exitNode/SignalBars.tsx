import { For, Show } from "solid-js";
import type { RouteGrade } from "@src/utils/destinations.ts";
import CardTooltip from "./CardTooltip.tsx";

const BAR_COUNT = 4;
const MEASURED_TOOLTIP =
  "Route quality from latency, free capacity and relay diversity.";

/** Same green/orange/red ramp as the graded stats, keyed on the filled count. */
const BAND_COLOR: Record<1 | 2 | 3 | 4, string> = {
  4: "text-text-green",
  3: "text-text-green",
  2: "text-text-orange",
  1: "text-text-red",
};

function filledBars(grade: RouteGrade): number {
  if (grade.kind === "measured") return grade.bars;
  return grade.kind === "weak" ? 1 : 0;
}

function label(grade: RouteGrade): string {
  switch (grade.kind) {
    case "measured":
      return `Route quality ${grade.bars} of ${BAR_COUNT}`;
    case "unmeasured":
      return "Route quality not measured yet";
    case "weak":
      return "Weak route";
    case "none":
      return "";
  }
}

function tooltip(grade: RouteGrade): string {
  if (grade.kind === "measured") {
    return `${label(grade)}. ${MEASURED_TOOLTIP}`;
  }
  if (grade.kind === "unmeasured") {
    return `${label(grade)}; the exit is being probed.`;
  }
  return `${label(grade)}: the best path found has degraded links.`;
}

/** Four rising bars; hollow while the exit is unmeasured, so the count is honest without color. */
export default function SignalBars(props: { grade: RouteGrade }) {
  const filled = () => filledBars(props.grade);
  const filledColor = () =>
    props.grade.kind === "measured"
      ? BAND_COLOR[props.grade.bars]
      : BAND_COLOR[1];
  const hollow = () => props.grade.kind === "unmeasured";

  return (
    <Show when={props.grade.kind !== "none"}>
      <CardTooltip tooltip={tooltip(props.grade)}>
        <svg
          width="16"
          height="12"
          viewBox="0 0 16 12"
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
                  x={i * 4}
                  y={12 - height}
                  width="3"
                  height={height}
                  rx="0.5"
                  class={isFilled() ? filledColor() : "text-text-muted"}
                  fill={hollow() ? "none" : "currentColor"}
                  stroke={hollow() ? "currentColor" : "none"}
                  stroke-width="1"
                />
              );
            }}
          </For>
        </svg>
      </CardTooltip>
    </Show>
  );
}
