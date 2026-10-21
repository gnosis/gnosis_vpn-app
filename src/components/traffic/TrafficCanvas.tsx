import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import {
  TRAFFIC_ROW_HEIGHT,
  type TrafficFrame,
} from "@src/services/trafficService.ts";

/** Share of a column the bar fills, indexed by byte band (1 through 6). */
const BAND_FILL = [0.18, 0.32, 0.46, 0.62, 0.8, 1] as const;
/** Vertical gap between rows so neighbouring blocks stay distinguishable. */
const ROW_GAP = 1;

export type TrafficPane = "upstream" | "downstream";

interface TrafficCanvasProps {
  pane: TrafficPane;
  frame: TrafficFrame | null;
  /** Visible rows, shared by both panes. */
  rows: number;
  firstRow: number;
  class?: string;
}

interface Colors {
  hopr: string;
  other: string;
}

/**
 * One traffic pane. Draws only blocks: no addresses, labels, headers, grid or
 * focus. Volume sets the bar length, category sets its hue, and the pane sets
 * which edge the bar grows from.
 */
export default function TrafficCanvas(props: TrafficCanvasProps) {
  let container!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  const [size, setSize] = createSignal({ width: 0, height: 0 });
  let colors: Colors | null = null;

  const readColors = (): Colors => {
    const style = getComputedStyle(document.documentElement);
    return {
      hopr: style.getPropertyValue("--color-traffic-hopr").trim() || "#8b7cf6",
      other: style.getPropertyValue("--color-traffic-other").trim() ||
        "#94a3b8",
    };
  };

  const draw = () => {
    const { width, height } = size();
    if (!canvas || width <= 0 || height <= 0) return;
    const ratio = globalThis.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const frame = props.frame;
    if (!frame) return;
    colors ??= readColors();

    const columnWidth = width / frame.timeframe_seconds;
    for (const cell of frame.cells) {
      if (cell.row >= props.rows) continue;
      const top = cell.row * TRAFFIC_ROW_HEIGHT;
      if (top >= height) continue;

      const fill = BAND_FILL[cell.band - 1] ?? 1;
      const barWidth = Math.min(columnWidth, Math.max(1, columnWidth * fill));
      // Category reads through hue and lightness; volume through bar length, and
      // the pane through the edge the bar grows from.
      const associated = cell.class === "hopr_associated";
      const left = props.pane === "upstream"
        ? cell.column * columnWidth
        : (cell.column + 1) * columnWidth - barWidth;

      context.fillStyle = associated ? colors.hopr : colors.other;
      context.fillRect(
        left,
        top,
        barWidth,
        Math.max(1, TRAFFIC_ROW_HEIGHT - ROW_GAP),
      );
    }
  };

  onMount(() => {
    const resize = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    resize.observe(container);

    // Canvas colors come from CSS variables, so a theme switch needs a redraw.
    const theme = new MutationObserver(() => {
      colors = null;
      draw();
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    onCleanup(() => {
      resize.disconnect();
      theme.disconnect();
    });
  });

  createEffect(() => {
    // Track every input the drawing depends on.
    props.frame;
    props.firstRow;
    props.rows;
    props.pane;
    size();
    draw();
  });

  return (
    <div ref={container} class={props.class ?? "h-1/2 w-full"}>
      <canvas ref={canvas} class="block h-full w-full" aria-hidden="true" />
    </div>
  );
}
