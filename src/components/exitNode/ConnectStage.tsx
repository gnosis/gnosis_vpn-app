import {
  type Accessor,
  createSignal,
  createUniqueId,
  For,
  Index,
  onCleanup,
  Show,
} from "solid-js";
import type { ConnectPhase } from "@src/services/vpnService.ts";
import {
  advanceProgress,
  clampLabel,
  phaseStart,
  STAGE_STEP_COUNT,
  stageStep,
  tween,
} from "@src/utils/connectStage.ts";

// Geometry and timing are the Stage 2.1 mock's connectSVG: a 300×92 stage, a globe of radius 40.
type Point = [number, number];

const CX = 150;
const CY = 46;
const R = 40;
const K = R / 54;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const place = ([x, y]: Point): Point => [
  round1(CX + (x - 150) * K),
  round1(CY + (y - 62) * K),
];

const NODES: Point[] = (
  [
    [118, 34],
    [142, 22],
    [168, 30],
    [130, 58],
    [158, 50],
    [184, 64],
    [124, 86],
    [150, 80],
    [176, 92],
    [196, 40],
  ] as Point[]
).map(place);
const YOU = place([108, 98]);
const EXIT = place([200, 46]);
// Candidate relays per attempt; the second one carries the "1 hop" label.
const HOP_SETS = [[3, 1, 4, 5], [0, 4, 2, 7], [6, 1, 5, 4], [3, 7, 2, 8]];

const legAt = (k: number): number => 0.27 + k * 0.115;
const hopLitAt = (k: number): number => legAt(k) + 0.07;
const EXIT_AT = 0.72;
// The mock's durations over its 12 s timeline, as fractions of it.
const DRAW = 0.1;
const FADE = 0.05;
const POP = 0.04;

// The svg is width-bound, so the hero crops to the globe and its labels to draw it larger.
const VIEW = {
  card: { box: "0 0 300 92", height: "h-23" },
  hero: { box: "40 0 220 92", height: "h-31.5" },
};
// what fits right of the exit inside the hero's crop
const HERO_LABEL_CHARS = 11;

const SYNC = "var(--color-control-tint)";
const SYNC_HI = "var(--color-text-primary)";

const STEP_TEXT = [
  "Finding relays",
  "One hop, a new relay per packet",
  "Securing the tunnel",
];

function arc(a: Point, b: Point, lift: number): string {
  const mx = round1((a[0] + b[0]) / 2);
  const my = round1(Math.min(a[1], b[1]) - lift);
  return `M${a[0]} ${a[1]}Q${mx} ${my} ${b[0]} ${b[1]}`;
}

const STARS = Array.from({ length: 34 }, (_, k) => {
  const angle = ((k * 137.5) % 360) * Math.PI / 180;
  const radius = R * Math.sqrt(((k * 53) % 100) / 100);
  return {
    x: round1(CX + radius * Math.cos(angle)),
    y: round1(CY + radius * Math.sin(angle) * 0.92),
    bright: k % 5 === 0,
    twinkle: k % 7 === 0 ? 2 + k % 3 : 0,
    k,
  };
});

const reducedMotion = (): boolean =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Eases toward the phase every frame, so the drawing never jumps between status polls. */
function animatedProgress(phase: () => ConnectPhase | null): Accessor<number> {
  const [progress, setProgress] = createSignal(0);
  let last = performance.now();
  let frame = requestAnimationFrame(function tick(now: number) {
    // a backgrounded window resumes where it was rather than leaping
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    setProgress((shown) => advanceProgress(shown, phase(), dt));
    frame = requestAnimationFrame(tick);
  });
  onCleanup(() => cancelAnimationFrame(frame));
  return progress;
}

/** The mock's connecting globe: you open channels to relays, then route through one to the exit. */
export default function ConnectStage(props: {
  phase: ConnectPhase | null;
  // picks the relays the routes run through, so each attempt draws its own
  seed: number;
  exitName: string;
  // distinct first relays the route walk found, when known
  relays: number | null;
  // replaces the step text, e.g. while a reconnect waits on its route
  caption?: string | null;
  size?: "card" | "hero";
}) {
  const still = reducedMotion();
  const progress = still
    ? () => phaseStart(props.phase)
    : animatedProgress(() => props.phase);
  const glowId = createUniqueId();
  const view = () => VIEW[props.size ?? "card"];
  const exitLabel = () =>
    props.size === "hero"
      ? clampLabel(props.exitName, HERO_LABEL_CHARS)
      : props.exitName;

  const hops = () => HOP_SETS[Math.abs(Math.floor(props.seed)) % 4];
  const peers = () => {
    const h = Math.abs(Math.floor(props.seed)) % 4;
    const others = NODES.map((_, i) => i)
      .filter((i) => !hops().includes(i))
      .sort((a, b) => ((a * 7 + h) % 11) - ((b * 7 + h) % 11))
      .slice(0, 2);
    return [...hops(), ...others];
  };
  const routeCount = () => Math.min(4, Math.max(1, props.relays ?? 4));
  const routes = () =>
    hops().slice(0, routeCount()).map((i, k) =>
      arc(YOU, NODES[i], 10 + k * 2) +
      arc(NODES[i], EXIT, 8 + k).replace(/^M[^Q]+/, "")
    );
  const labelNode = () => NODES[hops()[1]];

  const step = () => stageStep(props.phase);
  const caption = () =>
    props.caption ??
      (step() < STEP_TEXT.length
        ? STEP_TEXT[step()]
        : `Reaching the exit in ${props.exitName}`);

  const at = (from: number, to: number, begin: number, span: number) =>
    tween(progress(), from, to, begin, span);

  return (
    <div class="flex flex-col gap-1.5 px-3 pt-1.5 pb-2.5">
      <svg
        viewBox={view().box}
        class={`block ${view().height} w-full overflow-visible font-figures text-[9px]`}
        role="img"
        aria-label={`Connecting: opening channels to relays, then routing through one relay to the exit in ${props.exitName}`}
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="45%" r="55%">
            <stop offset="0" stop-color={SYNC} stop-opacity="0.16" />
            <stop offset="1" stop-color={SYNC} stop-opacity="0.02" />
          </radialGradient>
        </defs>
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill={`url(#${glowId})`}
          stroke={SYNC}
          stroke-opacity="0.3"
          stroke-width="1.2"
        />
        <ellipse
          cx={CX}
          cy={CY}
          rx={R}
          ry={R * 0.32}
          fill="none"
          stroke={SYNC}
          stroke-opacity="0.3"
        />
        <For each={[-1, 1]}>
          {(side) => (
            <ellipse
              cx={CX}
              cy={CY + side * R * 0.45}
              rx={R * 0.82}
              ry={R * 0.22}
              fill="none"
              stroke={SYNC}
              stroke-opacity="0.3"
              opacity="0.7"
            />
          )}
        </For>
        <For each={[0, 1, 2]}>
          {(k) => (
            <ellipse
              cx={CX}
              cy={CY}
              rx={still ? R * (1 - k * 0.4) : R}
              ry={R}
              fill="none"
              stroke={SYNC}
              stroke-opacity="0.3"
            >
              <Show when={!still}>
                <animate
                  attributeName="rx"
                  values={`${R};2;${R}`}
                  dur="12s"
                  begin={`${-k * 4}s`}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0;.5;1"
                  keySplines=".45 0 .55 1;.45 0 .55 1"
                />
              </Show>
            </ellipse>
          )}
        </For>
        <For each={STARS}>
          {(star) => (
            <circle
              cx={star.x}
              cy={star.y}
              r={star.bright ? 1.2 : 0.7}
              fill={SYNC}
              opacity={star.bright ? 0.5 : 0.28}
            >
              <Show when={!still && star.twinkle}>
                <animate
                  attributeName="opacity"
                  values=".15;.7;.15"
                  dur={`${star.twinkle}s`}
                  begin={`${-(star.k % star.twinkle)}s`}
                  repeatCount="indefinite"
                />
              </Show>
            </circle>
          )}
        </For>
        <For each={NODES}>
          {([x, y], i) => {
            const peer = () => peers().indexOf(i());
            const hop = () => hops().indexOf(i());
            const lit = () => hop() >= 0 && progress() >= hopLitAt(hop());
            return (
              <circle
                cx={x}
                cy={y}
                r={hop() >= 0 ? at(2.3, 3.4, hopLitAt(hop()), POP) : 2.3}
                fill={lit() ? SYNC_HI : SYNC}
                fill-opacity={lit() ? 1 : 0.6}
                opacity={peer() >= 0
                  ? at(0.55, 1, 0.09 + peer() * 0.035, POP)
                  : 0.55}
              />
            );
          }}
        </For>
        <Index each={routes()}>
          {(d, k) => (
            <>
              <path
                d={d()}
                fill="none"
                stroke={SYNC}
                stroke-width={k ? 4 : 7}
                stroke-linecap="round"
                pathLength="1"
                stroke-dasharray="1 1"
                stroke-dashoffset={at(1, 0, legAt(k), DRAW)}
                opacity={k ? 0.08 : 0.14}
              />
              <path
                d={d()}
                fill="none"
                stroke={SYNC}
                stroke-width={k ? 1.2 : 1.8}
                stroke-linecap="round"
                pathLength="1"
                stroke-dasharray="1 1"
                stroke-dashoffset={at(1, 0, legAt(k), DRAW)}
                opacity={k ? 0.7 : 1}
              />
            </>
          )}
        </Index>
        <Show when={!still}>
          <Index each={routes()}>
            {(d, k) => (
              <circle
                r="2.4"
                fill={SYNC_HI}
                opacity={at(
                  0,
                  1,
                  Math.max(EXIT_AT + 0.03, legAt(k) + 0.1),
                  POP,
                )}
              >
                <animateMotion
                  path={d()}
                  dur="2.4s"
                  begin={`${-k * 0.6}s`}
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines=".4 0 .6 1"
                />
              </circle>
            )}
          </Index>
        </Show>
        <Ring point={YOU} lit={() => 1} />
        <Ring point={EXIT} lit={() => at(0, 1, EXIT_AT, FADE)} />
        <text
          x={YOU[0] - 12}
          y={YOU[1] + 4}
          text-anchor="end"
          font-weight="600"
          fill="var(--color-text-soft)"
        >
          You
        </text>
        <text
          x={labelNode()[0]}
          y={labelNode()[1] + 14}
          text-anchor="middle"
          fill="var(--color-text-subtle)"
          opacity={at(0, 1, 0.3, FADE)}
        >
          1 hop
        </text>
        <text
          x={EXIT[0] + 13}
          y={EXIT[1] + 4}
          font-weight="600"
          fill="var(--color-text-soft)"
        >
          {exitLabel()}
        </text>
        <text
          x={EXIT[0] + 13}
          y={EXIT[1] + 15}
          fill="var(--color-text-subtle)"
        >
          Exit
        </text>
      </svg>
      <div class="flex h-4.5 items-center justify-between gap-2.5 overflow-hidden whitespace-nowrap text-xs text-text-subtle">
        <span class="flex min-w-0 items-center gap-1.75">
          <span class="flex shrink-0 gap-1" aria-hidden="true">
            <For each={Array.from({ length: STAGE_STEP_COUNT }, (_, i) => i)}>
              {(i) => (
                <span
                  class="size-1.75 rounded-full"
                  classList={{
                    "bg-control-tint": i < step(),
                    "bg-text-primary": i === step(),
                    "bg-bar-off": i > step(),
                  }}
                />
              )}
            </For>
          </span>
          <span class="truncate">{caption()}</span>
        </span>
        <Show when={props.relays}>
          {(relays) => (
            <span class="shrink-0 font-figures text-status-idle">
              {relays()} relays found
            </span>
          )}
        </Show>
      </div>
      <div class="h-0.75 overflow-hidden rounded-xs bg-control-bg">
        {/* A width set per frame, which no utility class can express */}
        <div
          class="h-full rounded-xs bg-control-tint"
          style={{ width: `${Math.round(progress() * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** A route end: a node ring that lights up, fading in over `lit`'s 0–1. */
function Ring(props: { point: Point; lit: () => number }) {
  const [x, y] = props.point;
  return (
    <>
      <circle
        cx={x}
        cy={y}
        r="6.5"
        fill="none"
        stroke={SYNC}
        stroke-opacity="0.6"
        stroke-width="1.3"
      />
      <circle cx={x} cy={y} r="3.2" fill={SYNC} fill-opacity="0.6" />
      <circle
        cx={x}
        cy={y}
        r="6.5"
        fill="none"
        stroke={SYNC}
        stroke-width="1.3"
        opacity={props.lit()}
      />
      <circle cx={x} cy={y} r="3.2" fill={SYNC_HI} opacity={props.lit()} />
    </>
  );
}
