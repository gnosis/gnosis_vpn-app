import { createEffect, onCleanup, onMount, Show } from "solid-js";
import Tooltip from "@src/components/common/Tooltip.tsx";
import type {
  ConnectedExit,
  TrafficEndpoint,
} from "@src/services/trafficService.ts";
import {
  arcPoints,
  cameraTarget,
  createStage,
  easeCamera,
  easeOutCubic,
  endpointGeo,
  type EndpointKind,
  exitGeo,
  FADE_SECONDS,
  type Geo,
  graticule,
  idFraction,
  type ListedEndpoint,
  projector,
  relayGeo,
  stageEndpoints,
  vec,
  type Vec3,
  YOU,
} from "@src/utils/globe.ts";

interface TrafficGlobeProps {
  /** Busiest first; tunnel destinations only while connected. */
  endpoints: TrafficEndpoint[];
  /** Completed seconds the endpoint totals cover. */
  observedSeconds: number;
  /** While connected, Via VPN traffic fans out from this exit. */
  exit: ConnectedExit | null;
  class?: string;
}

interface Colors {
  line: string;
  glow: string;
  gt: string;
  sync: string;
  syncHi: string;
  warn: string;
  ink: string;
  ink2: string;
  muted: string;
  bg: string;
  font: string;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

/** The design's viewBox: a 168 px globe in 420 × 400; everything scales with it. */
const VIEW = { width: 420, height: 400, radius: 168 };
const GRATICULE = graticule();
/** Points this far behind the rim still count as visible, so lines ease out instead of popping. */
const HORIZON = -0.05;

function kindOf(endpoint: TrafficEndpoint): EndpointKind {
  if (endpoint.tunnel) return "vpn";
  return endpoint.hopr_peer ? "relay" : "other";
}

function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex) return color;
  const n = parseInt(hex[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function TrafficGlobe(props: TrafficGlobeProps) {
  let container!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let exitLabel: HTMLDivElement | undefined;
  let size = { width: 0, height: 0 };
  let colors: Colors | null = null;
  let listed: ListedEndpoint[] = [];
  const stage = createStage();
  let camera: Geo | null = null;
  let lastTime: number | undefined;
  let frameRequest: number | undefined;

  const readColors = (): Colors => {
    const style = getComputedStyle(document.documentElement);
    const value = (name: string) => style.getPropertyValue(name).trim();
    return {
      line: value("--color-traffic-line"),
      glow: value("--color-traffic-glow"),
      gt: value("--color-traffic-gt"),
      sync: value("--color-traffic-sync"),
      syncHi: value("--color-traffic-sync-hi"),
      warn: value("--color-traffic-warn"),
      ink: value("--color-text-primary"),
      ink2: value("--color-text-secondary"),
      muted: value("--color-text-muted"),
      bg: value("--color-bg-primary"),
      font: getComputedStyle(container).fontFamily,
    };
  };

  const draw = (time: number, elapsed: number) => {
    const { width, height } = size;
    if (width <= 0 || height <= 0) return;
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
    const c = colors;

    const scale = Math.min(width / VIEW.width, height / VIEW.height);
    const radius = VIEW.radius * scale;
    const cx = width / 2;
    const cy = height / 2;

    const exitSpot = props.exit ? exitGeo(props.exit.id) : null;
    const target = cameraTarget(exitSpot);
    camera = camera ? easeCamera(camera, target, elapsed) : target;
    // A slow drift so the globe feels alive.
    const view = projector([camera[0], camera[1] + 7 * Math.sin(time / 14)]);
    const screen = (v: Vec3): Point => {
      const [x, y, z] = view(v);
      return { x: cx + radius * x, y: cy - radius * y, z };
    };
    const stroke = (points: Point[]) => {
      context.beginPath();
      points.forEach(({ x, y }, n) =>
        n === 0 ? context.moveTo(x, y) : context.lineTo(x, y)
      );
      context.stroke();
    };
    const dot = (at: Point, r: number, fill: string, alpha = 1) => {
      context.globalAlpha = alpha;
      context.beginPath();
      context.arc(at.x, at.y, r * scale, 0, Math.PI * 2);
      context.fillStyle = fill;
      context.fill();
      context.lineWidth = 2 * scale;
      context.strokeStyle = c.bg;
      context.stroke();
      context.globalAlpha = 1;
    };
    const ring = (at: Point, r: number, color: string) => {
      context.beginPath();
      context.arc(at.x, at.y, r * scale, 0, Math.PI * 2);
      context.lineWidth = 1.5 * scale;
      context.strokeStyle = color;
      context.stroke();
    };

    const glow = context.createRadialGradient(
      cx - 0.1 * radius,
      cy - 0.2 * radius,
      0,
      cx - 0.1 * radius,
      cy - 0.2 * radius,
      1.2 * radius,
    );
    glow.addColorStop(0, withAlpha(c.glow, 0.1));
    glow.addColorStop(1, withAlpha(c.glow, 0.03));
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = glow;
    context.fill();
    context.lineWidth = 1.5 * scale;
    context.strokeStyle = c.line;
    context.stroke();

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 0.8 * scale;
    context.strokeStyle = c.line;
    context.beginPath();
    for (const line of GRATICULE) {
      let pen = false;
      for (const geo of line) {
        const point = screen(vec(geo));
        if (point.z <= 0) {
          pen = false;
        } else if (pen) {
          context.lineTo(point.x, point.y);
        } else {
          context.moveTo(point.x, point.y);
          pen = true;
        }
      }
    }
    context.stroke();

    const exitPoint = exitSpot ? screen(vec(exitSpot)) : null;
    const exitVisible = exitPoint !== null && exitPoint.z > HORIZON;
    if (exitSpot && exitVisible) {
      context.setLineDash([4 * scale, 4 * scale]);
      context.lineWidth = 1.4 * scale;
      context.strokeStyle = c.syncHi;
      context.globalAlpha = 0.8;
      stroke(arcPoints(YOU, exitSpot, 1, 0.5).map(screen));
      context.globalAlpha = 1;
      context.setLineDash([]);
    }

    stageEndpoints(stage, listed, time);
    const drawn: {
      kind: EndpointKind;
      path: Point[];
      grow: number;
      fade: number;
      phase: number;
    }[] = [];
    for (const [id, shown] of stage.shown) {
      const origin = shown.kind === "vpn" ? exitSpot : YOU;
      if (!origin) continue;
      const relay = shown.kind === "relay";
      const age = time - shown.born;
      const grow = easeOutCubic(age / (relay ? 1 : 1.1));
      const spot = relay ? relayGeo(id) : endpointGeo(id, origin);
      const path = arcPoints(origin, spot, grow, relay ? 0.12 : 0.2).map(
        screen,
      );
      const end = path[path.length - 1];
      if (path.length < 2 || end.z <= HORIZON) continue;
      const leaving = shown.dying === null
        ? 1
        : Math.max(0, 1 - (time - shown.dying) / FADE_SECONDS);
      const arriving = relay ? 1 : Math.min(1, age / 0.5);
      const horizon = Math.min(1, Math.max(0, (end.z + 0.05) / 0.3));
      drawn.push({
        kind: shown.kind,
        path,
        grow,
        fade: leaving * arriving * horizon,
        phase: idFraction(id, "packet"),
      });
    }

    for (const { kind, path, fade } of drawn) {
      context.setLineDash(
        kind === "other" ? [3 * scale, 3 * scale] : [],
      );
      context.lineWidth = (kind === "relay" ? 2.4 : 1.1) * scale;
      context.strokeStyle = kind === "relay"
        ? c.gt
        : kind === "vpn"
        ? c.ink2
        : c.warn;
      context.globalAlpha = fade *
        (kind === "relay" ? 0.55 : kind === "vpn" ? 0.7 : 1);
      stroke(path);
    }
    context.setLineDash([]);
    context.globalAlpha = 1;

    // Packets glide at a fixed pace: their speed is decoration, not bandwidth.
    for (const { kind, path, grow, fade, phase } of drawn) {
      const relay = kind === "relay";
      if (relay ? !exitSpot || phase >= 0.34 : grow < 0.999 || phase >= 0.45) {
        continue;
      }
      const f = relay
        ? (time * 0.35 + phase) % 1
        : (time * 0.45 + phase * 3) % 1;
      const x = f * (path.length - 1);
      const n = Math.min(path.length - 2, Math.floor(x));
      const u = x - n;
      context.globalAlpha = fade;
      context.beginPath();
      context.arc(
        path[n].x + (path[n + 1].x - path[n].x) * u,
        path[n].y + (path[n + 1].y - path[n].y) * u,
        (relay ? 2 : 1.8) * scale,
        0,
        Math.PI * 2,
      );
      context.fillStyle = kind === "other" ? c.warn : c.syncHi;
      context.fill();
    }
    context.globalAlpha = 1;

    for (const { kind, path, grow, fade } of drawn) {
      const end = path[path.length - 1];
      if (kind === "relay") {
        dot(end, 4, c.gt, fade);
      } else if (grow > 0.8) {
        dot(
          end,
          (3.6 * (grow - 0.8)) / 0.2,
          kind === "vpn" ? c.ink2 : c.warn,
          fade,
        );
      }
    }

    if (exitPoint && exitVisible) {
      ring(exitPoint, 9, c.sync);
      dot(exitPoint, 5.5, c.syncHi);
    }
    if (exitLabel) {
      exitLabel.style.visibility = exitVisible ? "visible" : "hidden";
      if (exitPoint) {
        exitLabel.style.transform = `translate(${exitPoint.x}px, ${
          exitPoint.y + 12 * scale
        }px) translateX(-50%)`;
      }
    }

    const you = screen(vec(YOU));
    ring(you, 11, c.muted);
    dot(you, 7, c.ink);
    context.font = `500 ${11 * scale}px ${c.font}`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillStyle = c.ink2;
    context.fillText("You", you.x, you.y + 26 * scale);
  };

  const animate = (now: number) => {
    const time = now / 1000;
    const elapsed = Math.min(0.1, time - (lastTime ?? time));
    lastTime = time;
    draw(time, elapsed);
    frameRequest = requestAnimationFrame(animate);
  };

  onMount(() => {
    const resize = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) size = { width: rect.width, height: rect.height };
    });
    resize.observe(container);

    // Canvas colours come from CSS variables, so a theme switch needs a fresh read.
    const theme = new MutationObserver(() => {
      colors = null;
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    frameRequest = requestAnimationFrame(animate);

    onCleanup(() => {
      resize.disconnect();
      theme.disconnect();
      if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    });
  });

  createEffect(() => {
    const seconds = Math.max(1, props.observedSeconds);
    listed = props.endpoints.map((endpoint) => ({
      id: endpoint.id,
      kind: kindOf(endpoint),
      rate: (endpoint.sent + endpoint.received) / seconds,
    }));
  });

  return (
    <div
      ref={container}
      class={`relative min-h-0 overflow-hidden ${props.class ?? "flex-1"}`}
    >
      <canvas ref={canvas} class="block h-full w-full" aria-hidden="true" />
      <Show when={props.exit}>
        {(exit) => (
          <div
            ref={exitLabel}
            class="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-1 rounded-[5px] border border-border bg-bg-surface px-2 py-px text-[11px] leading-4 font-medium whitespace-nowrap text-text-secondary"
          >
            <span>{exit().country ?? exit().title}</span>
            <span class="pointer-events-auto">
              {/* The id hashes the exit's public IP, which the client does not hand over yet. */}
              <Tooltip content="Feature coming" position="top">
                <span class="font-mono text-text-muted">#X</span>
              </Tooltip>
            </span>
          </div>
        )}
      </Show>
    </div>
  );
}
