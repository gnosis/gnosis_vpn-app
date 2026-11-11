import { For, Show } from "solid-js";
import type { RouteGrade } from "@src/utils/destinations.ts";
import CardTooltip from "./CardTooltip.tsx";

const BAR_COUNT = 4;
const MEASURED_TOOLTIP =
  "Route quality from latency, free capacity and relay diversity.";

/** The status dot's green/orange/red, keyed on the filled count. */
const BAND_COLOR: Record<1 | 2 | 3 | 4, string> = {
  4: "text-status-ok",
  3: "text-status-ok",
  2: "text-status-warn",
  1: "text-status-bad",
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
export default function SignalBars(props: {
  grade: RouteGrade;
  // no tooltip: inside a clickable area its anchor would swallow the click
  bare?: boolean;
}) {
  const filled = () => filledBars(props.grade);
  const filledColor = () =>
    props.grade.kind === "measured"
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
        <CardTooltip tooltip={tooltip(props.grade)}>{bars()}</CardTooltip>
      </Show>
    </Show>
  );
}
