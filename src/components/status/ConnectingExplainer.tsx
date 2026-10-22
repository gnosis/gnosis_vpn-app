import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { DestinationState, UpPhase } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  CONNECT_STEP_COUNT,
  connectProgress,
  connectStep,
  connectStepText,
} from "@src/utils/connectPhase.ts";
import { destinationFlag, destinationTitle } from "@src/utils/destinations.ts";
import { getHopCount } from "@src/utils/exitHealth.ts";
import { shortPeerId } from "@src/utils/shortAddress.ts";
import {
  formatConnectionPhase,
  waitingForRouteMessage,
} from "@src/utils/status.ts";
import Flag from "../Flag.tsx";
import OwlIcon from "../icons/OwlIcon.tsx";
import Tooltip from "../common/Tooltip.tsx";

/**
 * Needs product sign-off against the current threat model before it changes:
 * it is the one place the app describes what a relay and an exit can see.
 */
export const HOPR_SESSION_FOOTNOTE =
  "Traffic passes the mixnode built into the app, then a relay the network keeps rotating. The relay never learns your destination; the exit never learns who you are.";

// Diagram geometry in viewBox units (300 x 122), left to right.
const VIEW_W = 300;
const VIEW_H = 122;
const DEVICE: Point = [20, 56];
const MIXNODE: Point = [82, 56];
const EXIT: Point = [276, 56];
const MIXNODE_R = 11;
const RELAY_DOTS: Point[] = [
  [180, 10],
  [206, 26],
  [184, 46],
  [212, 66],
  [186, 86],
  [204, 100],
];
// How often the highlighted relay moves on, and how long a packet takes end to end.
const RELAY_ROTATE_MS = 700;
const PACKET_PERIOD_MS = 1100;

type Point = [number, number];

/** `count` distinct dot indexes, in order, none of which repeat the current pick where that is possible. */
function pickRelays(count: number, current: number[]): number[] {
  const n = Math.min(count, RELAY_DOTS.length);
  const pool = RELAY_DOTS.map((_, i) => i).filter((i) => !current.includes(i));
  const from = pool.length >= n ? pool : RELAY_DOTS.map((_, i) => i);
  const picked: number[] = [];
  while (picked.length < n) {
    const i = from[Math.floor(Math.random() * from.length)];
    if (!picked.includes(i)) picked.push(i);
  }
  return picked.sort((a, b) => a - b);
}

/** Point `t` (0–1) of the way along a polyline, by arc length. */
function alongPath(points: Point[], t: number): Point {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
    lengths.push(d);
    total += d;
  }
  let target = t * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i]) {
      const f = lengths[i] === 0 ? 0 : target / lengths[i];
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
    }
    target -= lengths[i];
  }
  return points[points.length - 1];
}

function pathD(points: Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
}

/** What a connect is doing right now: a HOPR session diagram, the current step and the real phase behind it. */
export default function ConnectingExplainer(
  props: { destinationState: DestinationState },
) {
  const [appState] = useAppStore();

  const destination = () => props.destinationState.destination;
  const title = () => destinationTitle(destination());
  const phase = (): UpPhase | null =>
    appState.reconnecting?.phase ?? appState.connecting?.phase ?? null;
  const step = () => connectStep(phase());
  const progress = () => connectProgress(phase());
  const hops = () => Math.max(1, getHopCount(destination().routing));
  // The best path's relays, the only real ids we have; never padded with invented ones.
  const relayIds = createMemo((): string[] => {
    const walk = props.destinationState.route_health?.walk;
    return walk?.found === "Paths" ? walk.best_relays : [];
  });

  const stepText = () => {
    const s = step();
    return s === null
      ? waitingForRouteMessage(appState, destination().id)
      : connectStepText(s, title());
  };
  const phaseText = () => {
    const p = phase();
    return p ? formatConnectionPhase(p) : "Waiting for a route";
  };

  const reducedMotion = globalThis.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches ?? false;

  // The highlighted relays move on every RELAY_ROTATE_MS: the set of intermediate nodes keeps changing.
  const [active, setActive] = createSignal<number[]>(pickRelays(hops(), []));
  createEffect(() => {
    const count = hops();
    const timer = setInterval(
      () => setActive((cur) => pickRelays(count, cur)),
      RELAY_ROTATE_MS,
    );
    onCleanup(() => clearInterval(timer));
  });

  const route = (): Point[] => [
    DEVICE,
    MIXNODE,
    ...active().map((i) => RELAY_DOTS[i]),
    EXIT,
  ];

  // One packet travelling the active route, continuously.
  const [packet, setPacket] = createSignal<Point>(DEVICE);
  onMount(() => {
    if (reducedMotion) return;
    let raf = 0;
    let last = 0;
    let t = 0;
    const frame = (now: number) => {
      if (last) t = (t + (now - last) / PACKET_PERIOD_MS) % 1;
      last = now;
      setPacket(alongPath(route(), t));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onCleanup(() => cancelAnimationFrame(raf));
  });

  const isOnPath = (i: number) => active().includes(i);
  // Each relay's own link pair, mixnode -> relay -> exit; faint unless on the active path.
  const linkD = (i: number) =>
    pathD([[MIXNODE[0] + MIXNODE_R, MIXNODE[1]], RELAY_DOTS[i], [
      EXIT[0] - 14,
      EXIT[1],
    ]]);

  return (
    <section
      class="w-full rounded-xl border border-border bg-bg-surface px-3 pb-3 pt-2.5 text-xs"
      aria-live="polite"
    >
      <h2 class="font-bold text-text-primary">
        Establishing a HOPR session{" "}
        <Show when={relayIds().length > 0}>
          <span class="font-normal text-text-muted">
            · relay {relayIds().slice(0, hops()).map(shortPeerId).join(" → ")}
          </span>
        </Show>
      </h2>

      <div class="relative mb-0.5 mt-1.5">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          class="block h-auto w-full"
          aria-hidden="true"
        >
          {/* Links: the active route's links are drawn last so they sit on top. */}
          <For each={RELAY_DOTS}>
            {(_, i) => (
              <path
                d={linkD(i())}
                class={`fill-none stroke-[1.5] transition-[stroke] duration-300 ${
                  isOnPath(i()) ? "stroke-text-yellow" : "stroke-border"
                }`}
              />
            )}
          </For>
          <Show when={hops() > 1}>
            <path
              d={pathD(active().map((i) => RELAY_DOTS[i]))}
              class="fill-none stroke-text-yellow stroke-[1.5]"
            />
          </Show>
          <path
            d={pathD([[DEVICE[0] + 14, DEVICE[1]], [
              MIXNODE[0] - MIXNODE_R,
              MIXNODE[1],
            ]])}
            class="fill-none stroke-text-yellow stroke-[1.5]"
          />

          {/* You */}
          <rect
            x={DEVICE[0] - 14}
            y={DEVICE[1] - 12}
            width="28"
            height="20"
            rx="3"
            class="fill-bg-surface stroke-text-primary stroke-[1.6]"
          />
          <path
            d={`M${DEVICE[0] - 18} ${DEVICE[1] + 12}h36`}
            class="stroke-text-primary stroke-[1.8]"
            stroke-linecap="round"
          />
          <text
            x={DEVICE[0]}
            y={DEVICE[1] + 28}
            text-anchor="middle"
            class="fill-text-muted text-[9px]"
          >
            You
          </text>

          {/* Local mixnode */}
          <circle
            cx={MIXNODE[0]}
            cy={MIXNODE[1]}
            r={MIXNODE_R}
            class="fill-owl"
          />
          <foreignObject
            x={MIXNODE[0] - 7}
            y={MIXNODE[1] - 7}
            width="14"
            height="14"
          >
            {/* The circle is the owl token (navy / near-white); the page background contrasts with it in both themes. */}
            <OwlIcon class="size-full text-bg-primary" />
          </foreignObject>
          <text
            x={MIXNODE[0]}
            y={MIXNODE[1] + 26}
            text-anchor="middle"
            class="fill-text-muted text-[9px]"
          >
            Local mixnode
          </text>
          <text
            x={MIXNODE[0]}
            y={MIXNODE[1] + 37}
            text-anchor="middle"
            class="fill-text-muted text-[9px]"
          >
            in the app
          </text>

          {/* Relays */}
          <For each={RELAY_DOTS}>
            {([x, y], i) => (
              <circle
                cx={x}
                cy={y}
                r={isOnPath(i()) ? 7 : 5}
                class={`stroke-[1.5] transition-[fill,stroke] duration-300 ${
                  isOnPath(i())
                    ? "fill-text-yellow/15 stroke-text-yellow"
                    : "fill-bg-surface stroke-text-muted/60"
                }`}
              />
            )}
          </For>
          <text
            x="196"
            y="120"
            text-anchor="middle"
            class="fill-text-muted text-[9px]"
          >
            HOPR relays (rotating)
          </text>

          {/* Exit: the flag is an HTML overlay below, this is its frame. */}
          <rect
            x={EXIT[0] - 14}
            y={EXIT[1] - 11}
            width="28"
            height="22"
            rx="4"
            class="fill-bg-surface stroke-text-muted/60 stroke-[1.5]"
          />
          <text
            x={EXIT[0]}
            y={EXIT[1] + 26}
            text-anchor="middle"
            class="fill-text-muted text-[9px]"
          >
            {title()}
          </text>

          <Show when={!reducedMotion}>
            <circle
              cx={packet()[0]}
              cy={packet()[1]}
              r="3.5"
              class="fill-text-yellow"
            />
          </Show>
        </svg>
        <span
          class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${(EXIT[0] / VIEW_W) * 100}%`,
            top: `${(EXIT[1] / VIEW_H) * 100}%`,
          }}
        >
          <Flag code={destinationFlag(destination())} size="sm" />
        </span>
      </div>

      {/* The exact daemon phase is the tooltip of the step line. */}
      <Tooltip content={<span>{phaseText()}</span>} triggerClass="w-full">
        <div class="flex min-h-[18px] w-full items-center gap-2">
          <span class="flex gap-1" aria-hidden="true">
            <For each={Array.from({ length: CONNECT_STEP_COUNT }, (_, i) => i)}>
              {(i) => (
                <span
                  class={`size-[7px] rounded-full transition-colors duration-300 ${
                    step() !== null && i < step()!
                      ? "bg-vpn-light-green"
                      : step() === i
                      ? "bg-text-yellow"
                      : "bg-text-muted/40"
                  }`}
                />
              )}
            </For>
          </span>
          <span class="truncate text-text-primary">{stepText()}</span>
        </div>
      </Tooltip>

      <div
        class="mt-2 h-[3px] overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress())}
      >
        <div
          class="h-full rounded-full bg-text-yellow transition-[width] duration-700 ease-out"
          style={{ width: `${progress()}%` }}
        />
      </div>

      <p class="mt-2.5 border-t border-border pt-2 text-[11px] leading-snug text-text-muted">
        {HOPR_SESSION_FOOTNOTE}
      </p>
    </section>
  );
}
