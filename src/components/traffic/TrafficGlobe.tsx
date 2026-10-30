import { createEffect, onCleanup, onMount } from "solid-js";
import type { TrafficEndpoint } from "@src/services/trafficService.ts";
import {
  arcPoints,
  easeLinks,
  easePositions,
  graticule,
  HOME,
  layoutSlots,
  type Link,
  linkWidth,
  markedIds,
  MIN_LINK_WIDTH,
  onSphere,
  type Point,
  type Vec3,
} from "@src/utils/globe.ts";

interface TrafficGlobeProps {
  /** Busiest first; each one becomes a dot linked to the host. */
  endpoints: TrafficEndpoint[];
  /** Completed seconds the endpoint totals cover. */
  observedSeconds: number;
  class?: string;
}

interface Colors {
  surface: string;
  edge: string;
  grid: string;
  link: string;
  dot: string;
  hopr: string;
  hoprEdge: string;
  hoprLinkEdge: string;
  destination: string;
  destinationDot: string;
  home: string;
  ring: string;
  label: string;
}

const PADDING = 28;
const DOT_RADIUS = 4.5;
const HOME_RADIUS = 7;
const GRATICULE = graticule();

export default function TrafficGlobe(props: TrafficGlobeProps) {
  let container!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let size = { width: 0, height: 0 };
  let colors: Colors | null = null;
  const links = new Map<string, Link>();
  let targets = new Map<string, number>();
  let hoprPeers = new Set<string>();
  let destinations = new Set<string>();
  const positions = new Map<string, Point>();
  let frameRequest: number | undefined;
  let lastTime: number | undefined;

  const readColors = (): Colors => {
    const style = getComputedStyle(document.documentElement);
    const value = (name: string) => style.getPropertyValue(name).trim();
    return {
      surface: value("--color-globe-surface"),
      edge: value("--color-globe-edge"),
      grid: value("--color-globe-grid"),
      link: value("--color-globe-link"),
      dot: value("--color-globe-dot"),
      hopr: value("--color-globe-hopr"),
      hoprEdge: value("--color-globe-hopr-edge"),
      hoprLinkEdge: value("--color-globe-hopr-link-edge"),
      destination: value("--color-globe-destination"),
      destinationDot: value("--color-globe-destination-dot"),
      home: value("--color-globe-home"),
      ring: value("--color-bg-primary"),
      label: value("--color-text-secondary"),
    };
  };

  const draw = () => {
    const { width, height } = size;
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
    colors ??= readColors();

    const radius = Math.max(0, Math.min(width, height) / 2 - PADDING);
    if (radius <= 0) return;
    const cx = width / 2;
    const cy = height / 2;
    const toScreen = (point: Point) => ({
      x: cx + point.x * radius,
      y: cy - point.y * radius,
    });

    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = colors.surface;
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = colors.grid;
    for (const line of GRATICULE) {
      context.beginPath();
      line.forEach((point, n) => {
        const { x, y } = toScreen(point);
        if (n === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.lineWidth = 2;
    context.strokeStyle = colors.edge;
    context.stroke();

    // Thin links first so busy ones stay on top.
    const ordered = [...links.entries()].sort((a, b) =>
      a[1].width - b[1].width
    );
    const spots = new Map<string, Vec3>();
    for (const [id, position] of positions) {
      spots.set(id, onSphere(position.x, position.y));
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const [id, link] of ordered) {
      const spot = spots.get(id);
      if (!spot || link.width <= 0) continue;
      const path = arcPoints(HOME, spot).map(toScreen);
      context.beginPath();
      path.forEach(({ x, y }, n) => {
        if (n === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      const hopr = hoprPeers.has(id);
      if (hopr) {
        // Darker edges under the pale HOPR yellow so the line reads on a light globe.
        context.strokeStyle = colors.hoprLinkEdge;
        context.lineWidth = link.width + 1;
        context.stroke();
      }
      let lineColor = colors.link;
      if (destinations.has(id)) lineColor = colors.destination;
      if (hopr) lineColor = colors.hopr;
      // Translucent halo, solid core; the HOPR halo stays opaque so its edge shows only as an outline.
      context.strokeStyle = lineColor;
      context.globalAlpha = hopr ? 1 : 0.4;
      context.lineWidth = link.width;
      context.stroke();
      context.globalAlpha = 1;
      context.lineWidth = Math.max(1, link.width * 0.35);
      context.stroke();
    }

    for (const [id, link] of ordered) {
      const spot = spots.get(id);
      if (!spot) continue;
      const { x, y } = toScreen(spot);
      // A dot fades out with its link once its traffic leaves the window.
      context.globalAlpha = link.target > 0
        ? 1
        : Math.min(1, link.width / MIN_LINK_WIDTH);
      context.beginPath();
      context.arc(x, y, DOT_RADIUS + 2, 0, Math.PI * 2);
      context.fillStyle = colors.ring;
      context.fill();
      context.beginPath();
      context.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      if (hoprPeers.has(id)) {
        // An outline keeps the yellow dot apart from its yellow link.
        context.fillStyle = colors.hopr;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = colors.hoprEdge;
        context.stroke();
      } else if (destinations.has(id)) {
        context.fillStyle = link.target > 0
          ? colors.destination
          : colors.destinationDot;
        context.fill();
      } else {
        context.fillStyle = link.target > 0 ? colors.link : colors.dot;
        context.fill();
      }
    }
    context.globalAlpha = 1;

    const home = toScreen(HOME);
    context.beginPath();
    context.arc(home.x, home.y, HOME_RADIUS + 6, 0, Math.PI * 2);
    context.lineWidth = 2;
    context.strokeStyle = colors.label;
    context.stroke();
    context.beginPath();
    context.arc(home.x, home.y, HOME_RADIUS + 2, 0, Math.PI * 2);
    context.fillStyle = colors.ring;
    context.fill();
    context.beginPath();
    context.arc(home.x, home.y, HOME_RADIUS, 0, Math.PI * 2);
    context.fillStyle = colors.home;
    context.fill();
    context.font = "12px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillStyle = colors.label;
    context.fillText("You", home.x, home.y + HOME_RADIUS + 10);
  };

  const animate = (time: number) => {
    const elapsed = lastTime === undefined ? 16 : time - lastTime;
    lastTime = time;
    const widthsMoving = easeLinks(links, targets, elapsed);
    const slots = layoutSlots(links.keys(), hoprPeers, destinations);
    const dotsMoving = easePositions(positions, slots, elapsed);
    const animating = widthsMoving || dotsMoving;
    draw();
    frameRequest = animating ? requestAnimationFrame(animate) : undefined;
    if (!animating) lastTime = undefined;
  };

  const startAnimation = () => {
    if (frameRequest === undefined) {
      frameRequest = requestAnimationFrame(animate);
    }
  };

  onMount(() => {
    const resize = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      size = { width: rect.width, height: rect.height };
      draw();
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
      if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    });
  });

  createEffect(() => {
    const seconds = Math.max(1, props.observedSeconds);
    const next = new Map<string, number>();
    for (const endpoint of props.endpoints) {
      next.set(
        endpoint.id,
        linkWidth((endpoint.sent + endpoint.received) / seconds),
      );
    }
    targets = next;
    hoprPeers = markedIds(props.endpoints, "hopr_peer", hoprPeers, links);
    destinations = markedIds(props.endpoints, "tunnel", destinations, links);
    startAnimation();
  });

  return (
    <div ref={container} class={`min-h-0 ${props.class ?? "flex-1"}`}>
      <canvas ref={canvas} class="block h-full w-full" aria-hidden="true" />
    </div>
  );
}
