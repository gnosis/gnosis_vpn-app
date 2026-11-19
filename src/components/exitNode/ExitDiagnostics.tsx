import {
  createMemo,
  createSignal,
  createUniqueId,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  freeSlots,
  getExitData,
  rankContext,
} from "@src/utils/destinations.ts";
import {
  formatLatency,
  formatRouting,
  formatSecondsAgo,
  getLastCheckedEpoch,
  getLatencyLevel,
  getSlotLoad,
  getSlotLoadLevel,
} from "@src/utils/exitHealth.ts";
import { levelColorClass } from "./levelColor.ts";
import Tooltip from "../common/Tooltip.tsx";

/** Hovering a metric's name or its value explains it; `tip` builds fresh nodes for each tooltip. */
function Explained(props: { tip: () => JSX.Element; children: JSX.Element }) {
  return <Tooltip content={props.tip()}>{props.children}</Tooltip>;
}

/** A metric's name: the focus stop for its explanation, which screen readers get as its description. */
function Label(props: { tip: () => JSX.Element; children: JSX.Element }) {
  const descriptionId = createUniqueId();
  return (
    <Explained tip={props.tip}>
      <span tabIndex={0} aria-describedby={descriptionId}>
        {props.children}
      </span>
      {/* Always in the DOM so the description resolves on focus; the portalled bubble mounts too late for that. */}
      <div id={descriptionId} class="sr-only">{props.tip()}</div>
    </Explained>
  );
}

const say = (text: string): () => JSX.Element => () => <span>{text}</span>;

function Row(
  props: { label: string; tip: () => JSX.Element; value: string | null },
) {
  return (
    <div class="flex justify-between gap-2 py-0.75 text-xs text-text-subtle">
      <Label tip={props.tip}>{props.label}</Label>
      <Explained tip={props.tip}>
        <span class="font-figures font-medium text-text-primary">
          {props.value ?? "—"}
        </span>
      </Explained>
    </div>
  );
}

/** The connected exit's details under the location card: latency and load, then the route's diagnostics. */
export default function ExitDiagnostics(props: {
  destinationState: DestinationState;
  latencyMs: number | null;
}) {
  const [appState] = useAppStore();
  const exit = createMemo(() =>
    getExitData(props.destinationState, appState.probe)
  );
  const routeHealth = () => props.destinationState.route_health ?? null;

  // Ticks between status updates, so "14 s ago" keeps counting.
  const [nowSec, setNowSec] = createSignal(Date.now() / 1000);
  const tick = setInterval(() => setNowSec(Date.now() / 1000), 1000);
  onCleanup(() => clearInterval(tick));

  const lastChecked = () => {
    const rh = routeHealth();
    const epoch = rh ? getLastCheckedEpoch(rh, exit()) : null;
    return epoch === null
      ? null
      : formatSecondsAgo(Math.max(0, Math.round(nowSec() - epoch)));
  };
  const latency = () =>
    props.latencyMs === null ? null : formatLatency(props.latencyMs);
  const latencyColor = () =>
    props.latencyMs === null
      ? "text-text-primary"
      : levelColorClass[getLatencyLevel(props.latencyMs)];
  const load = () => getSlotLoad(exit());
  const loadColor = () => {
    const l = load();
    return l
      ? levelColorClass[getSlotLoadLevel(l.percent)]
      : "text-text-primary";
  };
  const loadTip = () => (
    <div class="space-y-1">
      <p class="font-bold">Share of the exit's connection slots in use</p>
      <Show when={load()}>
        {(l) => (
          <p>
            {l().used} of {l().total} slots taken = {l().percent}%
          </p>
        )}
      </Show>
      <p>Green up to 50%, orange up to 75%, red above.</p>
    </div>
  );
  const latencyTip = say(
    "One way through the relay to the exit. Green under 500 ms, orange up to 1,100 ms, red above.",
  );
  const openSpots = () => {
    const free = freeSlots(props.destinationState, rankContext(appState));
    if (free === null) return null;
    return free > 0 ? "Yes" : "No";
  };

  return (
    // Scrolls in the card's scroller, which also sets its sides
    <div class="flex flex-col gap-2.5 py-3">
      <div class="grid shrink-0 grid-cols-2 border-b border-line pb-2">
        <div class="flex items-baseline justify-between gap-2 pr-3.5 text-xs whitespace-nowrap text-text-subtle">
          <Label tip={latencyTip}>Latency</Label>
          <Explained tip={latencyTip}>
            <span
              class={`font-figures text-[17px] leading-5 font-semibold tracking-[-0.02em] ${latencyColor()}`}
            >
              {latency() ?? "—"}
            </span>
          </Explained>
        </div>
        <div class="flex items-baseline justify-between gap-2 border-l border-line pl-3.5 text-xs text-text-subtle">
          <Label tip={loadTip}>Server load</Label>
          <Explained tip={loadTip}>
            <span
              class={`font-figures text-[17px] leading-5 font-semibold tracking-[-0.02em] ${loadColor()}`}
            >
              {load() ? `${load()!.percent}%` : "—"}
            </span>
          </Explained>
        </div>
      </div>
      <div class="flex shrink-0 flex-col">
        <Row
          label="Last checked"
          tip={say("When this exit was last measured.")}
          value={lastChecked()}
        />
        <Row
          label="Route"
          tip={say("Relays between you and the exit.")}
          value={formatRouting(props.destinationState.destination.hops)}
        />
        <Row
          label="Open spots"
          tip={say("Whether the exit has a free connection slot for you.")}
          value={openSpots()}
        />
      </div>
    </div>
  );
}
