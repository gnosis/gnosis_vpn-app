import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { WORLD_PATHS } from "@assets/map/world.ts";
import {
  type Bbox,
  fitViewBox,
  type Framing,
  lerpFraming,
  MAP_SIZE,
  type Point,
  pointToBbox,
  type Viewport,
} from "@src/utils/mercator.ts";
import { easeOutCubic } from "@src/utils/easing.ts";
import {
  chainedPath,
  pointOnRoute,
  type Route,
  type RoutePair,
  routePath,
} from "@src/utils/route.ts";
import { createReducedMotion } from "@src/utils/reducedMotion.ts";
import { resolveRegion } from "@src/utils/regions.ts";

export interface WorldMapProps {
  /// ISO 3166-1 alpha-2 of the country the user is in; frames and highlights it.
  homeCode?: string;
  homePoint?: Point;
  exitPoint?: Point;
  /// The paths traffic takes, once there is a connection to draw.
  routes?: RoutePair;
  /// Identifies the route. The legs draw themselves on once per value of this, so it should
  /// change when the exit does and not while a single connection is being established.
  routeKey?: string;
  /// Solid lines once the tunnel is up; dotted while it is still being established.
  connected?: boolean;
  /// What a screen reader is told; the map itself is decorative.
  label: string;
}

/// Margin around the framed countries, as a fraction of their span.
const PADDING = 0.45;
/// Marker sizes in CSS pixels; multiplied by the framing's scale to stay put under zoom.
const DOT_RADIUS = 3.5;
const HALO_RADIUS = 7;
const WAYPOINT_RADIUS = 2.4;
const STROKE_WIDTH = 0.8;

/// How long the view takes to settle on a new framing.
const VIEW_EASE_MS = 700;
/// One second per leg; fed to `.route-draw`'s animation-duration in index.css.
const ROUTE_LEG_DRAW_MS = 1000;
/// Sweeps of the forward route before the return route joins it, so the eye follows one line
/// out before a second appears.
const RETURN_AFTER_SWEEPS = 2;
/// One lap of the whole route.
const DOT_CYCLE_MS = 3000;
const DOT_COUNT = 3;
/// The route's line weight in CSS pixels, and the heavier weight its dots take while the
/// tunnel is still being established — a dot is only as wide as the stroke, so at the solid
/// line's weight the dots are too fine to read as dotted at all.
const ROUTE_WIDTH = 1.4;
const PENDING_DOT_WIDTH = 2.6;
/// Centre-to-centre spacing of those dots, in CSS pixels.
const PENDING_DOT_SPACING = 6.5;

/// The world, framed on where the user is and where their traffic comes out.
///
/// Deliberately inert as far as input goes: there are no pointer handlers and the svg is
/// `pointer-events-none`, so there is nothing to zoom or pan. Everything that moves is
/// driven by the props, not by the user.
export default function WorldMap(props: WorldMapProps) {
  // The panel is sized by flexbox, and the framing needs real pixels to keep markers a
  // constant on-screen size. Until the first measurement an approximate box is close enough
  // that the initial paint is not visibly wrong.
  const [viewport, setViewport] = createSignal<Viewport>({
    width: 328,
    height: 132,
  });
  let container: HTMLDivElement | undefined;
  // Every loop below checks this instead of cancelling a stored frame id — the convention
  // the one other rAF loop in this codebase (LocationBanner) already uses.
  let mounted = true;
  onCleanup(() => {
    mounted = false;
  });

  const reducedMotion = createReducedMotion();

  onMount(() => {
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ width, height });
    });
    observer.observe(container);
    onCleanup(() => observer.disconnect());
  });

  const homeRegion = createMemo(() => resolveRegion(props.homeCode));

  const target = createMemo<Framing>(() => {
    const boxes: Bbox[] = [];
    const region = homeRegion();
    if (region) boxes.push(region.bbox);
    if (props.exitPoint) boxes.push(pointToBbox(props.exitPoint));
    if (props.homePoint && !region) boxes.push(pointToBbox(props.homePoint));
    // Waypoints are invented positions, but the view still has to contain them or markers
    // would sit outside the frame. Both directions count: the return path goes through its
    // own countries, which can sit well clear of the forward ones.
    const routes = props.routes;
    if (routes) {
      for (
        const point of [...routes.forward.waypoints, ...routes.back.waypoints]
      ) {
        boxes.push(pointToBbox(point));
      }
    }
    return fitViewBox(boxes, viewport(), PADDING);
  });

  // What is actually painted. It chases `target()` rather than tracking it, so a connection
  // landing slides the view instead of cutting to it.
  const [displayed, setDisplayed] = createSignal<Framing>(target());

  createEffect(() => {
    const to = target();
    const from = displayed();
    // Nothing to ease from on the first paint, and honouring reduced motion means arriving
    // without the journey.
    if (reducedMotion() || from.box.every((v, i) => v === to.box[i])) {
      setDisplayed(to);
      return;
    }

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    const start = performance.now();
    const step = (now: number) => {
      if (cancelled || !mounted) return;
      const t = Math.min((now - start) / VIEW_EASE_MS, 1);
      setDisplayed(lerpFraming(from, to, easeOutCubic(t), viewport()));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  const scale = () => displayed().scale;

  /// A dotted line that keeps being redrawn says "still being established"; a solid, static
  /// one says the tunnel is up and carrying traffic.
  const pending = () => !props.connected;

  /// What the sweep covers: the outbound route alone until the return path joins, then both
  /// chained into one loop.
  const sweptRoutes = (): Route[] => {
    const routes = props.routes;
    if (!routes) return [];
    return returnDue() ? [routes.forward, routes.back] : [routes.forward];
  };
  const sweepPath = () => chainedPath(sweptRoutes());
  /// The outbound sweep's own length. Deliberately independent of `returnDue`: the effect
  /// below schedules against it, and reading the combined `sweepMs` there would make that
  /// effect depend on the signal it sets, so it would cancel and reschedule itself forever.
  const forwardSweepMs = () =>
    (props.routes?.forward.legs.length ?? 1) * ROUTE_LEG_DRAW_MS;
  /// One second per leg, so the sweep's pace never depends on how far apart the hops are, and
  /// adding the return path lengthens the cycle rather than making everything draw faster.
  const sweepMs = () =>
    Math.max(1, sweptRoutes().reduce((n, r) => n + r.legs.length, 0)) *
    ROUTE_LEG_DRAW_MS;
  /// SVG looks masks up globally, so the id has to be unique to this route. It also changes
  /// when the return path joins, which remounts the mask and restarts the sweep from the top
  /// rather than letting the longer cycle pick up mid-stride.
  const maskId = () =>
    `route-reveal-${(props.routeKey ?? "none").replace(/[^\w-]/g, "")}-${
      returnDue() ? "loop" : "out"
    }`;

  // Two things happen at different moments, so they are two signals.
  //
  // `returnDue` lengthens the sweep to take in the return path, after the outbound route has
  // swept on its own a couple of times. `returnShown` mounts that route, one sweep later —
  // exactly when the sweep reaches it. The line itself is masked and so invisible until then
  // either way, but its hop marker is not, and mounting both together left an orange dot
  // sitting on the map with nothing attached to it.
  //
  // Already connected means already established: show everything at once.
  const [returnDue, setReturnDue] = createSignal(false);
  const [returnShown, setReturnShown] = createSignal(false);
  createEffect(() => {
    const key = props.routeKey;
    if (!key) {
      setReturnDue(false);
      setReturnShown(false);
      return;
    }
    if (props.connected || reducedMotion()) {
      setReturnDue(true);
      setReturnShown(true);
      return;
    }
    setReturnDue(false);
    setReturnShown(false);
    const sweep = forwardSweepMs();
    const due = setTimeout(
      () => setReturnDue(true),
      RETURN_AFTER_SWEEPS * sweep,
    );
    const shown = setTimeout(
      () => setReturnShown(true),
      (RETURN_AFTER_SWEEPS + 1) * sweep,
    );
    onCleanup(() => {
      clearTimeout(due);
      clearTimeout(shown);
    });
  });

  // Traffic dots, shown only once there is traffic to represent. Progress is a plain 0..1
  // ramp the rAF loop advances; positions come from the route's own Bezier maths, so no SVG
  // path sampling and no SMIL.
  const [progress, setProgress] = createSignal(0);
  createEffect(() => {
    if (!props.routes || !props.connected || reducedMotion()) return;
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    const start = performance.now();
    const step = (now: number) => {
      if (cancelled || !mounted) return;
      setProgress(((now - start) % DOT_CYCLE_MS) / DOT_CYCLE_MS);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  const dotsAlong = (route: Route | undefined): Point[] => {
    if (!route || !props.connected || reducedMotion()) return [];
    const points: Point[] = [];
    for (let i = 0; i < DOT_COUNT; i++) {
      // Evenly spaced around one lap, so the stream looks continuous rather than bunched.
      const at = (progress() + i / DOT_COUNT) % 1;
      const point = pointOnRoute(route, at);
      if (point) points.push(point);
    }
    return points;
  };

  return (
    <div
      ref={container}
      class="h-full w-full overflow-hidden rounded-xl bg-bg-card-outer"
    >
      <svg
        class="h-full w-full pointer-events-none"
        viewBox={displayed().viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={props.label}
      >
        <For each={Object.values(WORLD_PATHS)}>
          {(d) => (
            <path
              d={d}
              fill-rule="evenodd"
              class="fill-bg-card stroke-border"
              stroke-width={STROKE_WIDTH * scale()}
            />
          )}
        </For>

        {
          /* Redrawn on top rather than branching the loop above, so the tint layers over the
            base fill and the country still reads as part of the same landmass. */
        }
        <Show when={props.homeCode && WORLD_PATHS[props.homeCode]}>
          {(d) => (
            <path
              d={d()}
              fill-rule="evenodd"
              class="fill-vpn-yellow/30 stroke-vpn-yellow"
              stroke-width={1.2 * scale()}
            />
          )}
        </Show>

        <Show when={props.routes}>
          {(routes) => (
            <>
              {
                /* One mask over both directions at once. The forward route ends where the
                  return route begins, so the two chain into a single unbroken path and one
                  sweep crosses every leg in turn — give each direction its own mask and they
                  sweep side by side instead. */
              }
              <Show when={pending()}>
                <defs>
                  <mask
                    id={maskId()}
                    maskUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width={MAP_SIZE}
                    height={MAP_SIZE}
                  >
                    <path
                      d={sweepPath()}
                      // Normalises the curve to 100 units so the dash maths in .route-draw is
                      // length-independent. It rescales every dash on its own element, which
                      // is exactly why it belongs here and not on the visible lines, whose
                      // dots are measured in map units.
                      pathLength="100"
                      fill="none"
                      stroke="white"
                      // Comfortably wider than the lines, so the reveal never clips their
                      // edges or their round caps.
                      stroke-width={PENDING_DOT_WIDTH * 2 * scale()}
                      stroke-linecap="round"
                      class="route-draw"
                      style={{ "--route-draw-duration": `${sweepMs()}ms` }}
                    />
                  </mask>
                </defs>
              </Show>

              <RouteLayer
                route={routes().forward}
                tone="forward"
                maskId={pending() ? maskId() : undefined}
                pending={pending()}
                scale={scale()}
                dots={dotsAlong(routes().forward)}
                routeKey={props.routeKey}
              />
              {
                /* The return path is a separate route through its own relays, not the forward
                  line reversed, so it gets its own colour and its own hops. */
              }
              <Show when={returnShown()}>
                <RouteLayer
                  route={routes().back}
                  tone="back"
                  maskId={pending() ? maskId() : undefined}
                  pending={pending()}
                  scale={scale()}
                  dots={dotsAlong(routes().back)}
                  routeKey={props.routeKey}
                />
              </Show>
            </>
          )}
        </Show>

        <Show when={props.homePoint}>
          {(point) => <Marker point={point()} scale={scale()} tone="home" />}
        </Show>
        <Show when={props.exitPoint}>
          {(point) => <Marker point={point()} scale={scale()} tone="exit" />}
        </Show>
      </svg>
    </div>
  );
}

interface RouteLayerProps {
  route: Route;
  /// Outbound traffic is green like the exit marker; the return leg is orange so the two
  /// directions stay tellable apart where they cross.
  tone: "forward" | "back";
  /// The reveal mask to wear while sweeping, if any. Both directions share one once the
  /// return path has joined, which is what sequences them.
  maskId?: string;
  /// Dotted while the tunnel is still being established.
  pending: boolean;
  scale: number;
  dots: Point[];
  routeKey?: string;
}

/// One direction of a connection: its line, its hops, and its traffic.
function RouteLayer(props: RouteLayerProps) {
  const stroke = () =>
    props.tone === "forward" ? "stroke-vpn-light-green" : "stroke-vpn-orange";
  const fill = () =>
    props.tone === "forward" ? "fill-vpn-light-green" : "fill-vpn-orange";
  const d = () => routePath(props.route);
  const width = () =>
    (props.pending ? PENDING_DOT_WIDTH : ROUTE_WIDTH) * props.scale;
  const dash = () =>
    props.pending ? `0 ${PENDING_DOT_SPACING * props.scale}` : undefined;

  return (
    <>
      <path
        data-route={`${props.routeKey}:${props.tone}`}
        d={d()}
        fill="none"
        class={stroke()}
        stroke-width={width()}
        stroke-linecap="round"
        stroke-dasharray={dash()}
        mask={props.maskId ? `url(#${props.maskId})` : undefined}
      />

      {
        /* Anonymous by design: the daemon reports how many relays carry a session but never
          which, so these are styled as waypoints, not places. */
      }
      <For each={props.route.waypoints}>
        {(point) => (
          <circle
            cx={point[0]}
            cy={point[1]}
            r={WAYPOINT_RADIUS * props.scale}
            fill="none"
            class={`${stroke()} opacity-70`}
            stroke-width={1.2 * props.scale}
          />
        )}
      </For>

      <For each={props.dots}>
        {(point) => (
          <circle
            data-traffic-dot={props.tone}
            cx={point[0]}
            cy={point[1]}
            r={1.8 * props.scale}
            class={fill()}
          />
        )}
      </For>
    </>
  );
}

function Marker(
  props: { point: Point; scale: number; tone: "home" | "exit" },
) {
  const fill = () =>
    props.tone === "home" ? "fill-vpn-yellow" : "fill-vpn-light-green";
  return (
    <>
      <circle
        cx={props.point[0]}
        cy={props.point[1]}
        r={HALO_RADIUS * props.scale}
        class={`${fill()} opacity-25`}
      />
      <circle
        cx={props.point[0]}
        cy={props.point[1]}
        r={DOT_RADIUS * props.scale}
        class={fill()}
      />
    </>
  );
}
