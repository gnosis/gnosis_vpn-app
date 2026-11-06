import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { MB_PER_EXIT } from "@src/utils/credit.ts";
import {
  freeSlots,
  getExitData,
  rankContext,
} from "@src/utils/destinations.ts";
import {
  formatPathValue,
  formatRelays,
  formatRouting,
  formatSecondsAgo,
  getLastCheckedEpoch,
  getLatencyLevel,
  getSlotLoad,
  getSlotLoadLevel,
} from "@src/utils/exitHealth.ts";
import { levelColorClass } from "./levelColor.ts";
import Tooltip from "../common/Tooltip.tsx";
import FeatureComing from "../settings/FeatureComing.tsx";

const RELIABILITY = ["Less reliable", "Less reliable", "Reliable"];

/** The label in a diagnostics row, with its explanation on hover. */
function Label(props: { text: string; tip?: string }) {
  return (
    <Show when={props.tip} fallback={<span>{props.text}</span>}>
      {(tip) => (
        <Tooltip content={<span>{tip()}</span>}>
          <span class="cursor-help">{props.text}</span>
        </Tooltip>
      )}
    </Show>
  );
}

/** The mock's circled "i"; its parent supplies the tooltip. */
function InfoDot(props: { label: string }) {
  return (
    <span
      class="flex size-3.75 cursor-help items-center justify-center rounded-full border border-status-idle text-[9.5px] font-bold text-text-subtle"
      aria-label={props.label}
      role="img"
    >
      i
    </span>
  );
}

function Row(props: { label: string; tip?: string; value: string | null }) {
  return (
    <div class="flex justify-between gap-2 py-0.75 text-xs text-text-subtle">
      <Label text={props.label} tip={props.tip} />
      <span class="font-figures font-medium text-text-primary">
        {props.value ?? "—"}
      </span>
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
  const walk = () => {
    const w = routeHealth()?.walk;
    return w?.type === "paths" ? w : null;
  };

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
    props.latencyMs === null
      ? null
      : `${props.latencyMs.toLocaleString("en")} ms`;
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
      <p>Lower is better.</p>
    </div>
  );
  const pathValue = () => {
    const rh = routeHealth();
    return rh ? formatPathValue(rh) : null;
  };
  const relays = () => {
    const rh = routeHealth();
    return rh ? formatRelays(rh) : null;
  };
  const openSpots = () => {
    const free = freeSlots(props.destinationState, rankContext(appState));
    if (free === null) return null;
    return free > 0 ? "Yes" : "No";
  };
  const reliability = () => {
    const w = walk();
    if (!w) return null;
    return RELIABILITY[w.distinct_first_relays] ?? "Very reliable";
  };

  return (
    <div class="flex flex-col gap-2.5 p-3">
      <div class="grid grid-cols-2 border-b border-line pb-2">
        <div class="flex items-baseline justify-between gap-2 pr-3.5 text-xs text-text-subtle">
          <Label
            text="Latency"
            tip="One way through the relay to the exit. Expected ~200 ms; lower is better."
          />
          <span
            class={`font-figures text-[17px] leading-5 font-semibold tracking-[-0.02em] ${latencyColor()}`}
          >
            {latency() ?? "—"}
          </span>
        </div>
        <div class="flex items-baseline justify-between gap-2 border-l border-line pl-3.5 text-xs text-text-subtle">
          <span class="flex items-center gap-1.5">
            Server load
            <Tooltip content={loadTip()} tabIndex={0}>
              <InfoDot label="How server load is calculated" />
            </Tooltip>
          </span>
          <span
            class={`font-figures text-[17px] leading-5 font-semibold tracking-[-0.02em] ${loadColor()}`}
          >
            {load() ? `${load()!.percent}%` : "—"}
          </span>
        </div>
      </div>
      <div class="flex flex-col">
        <span class="mb-1 text-xs text-text-subtle">Diagnostics</span>
        <Row
          label="Last checked"
          tip="When this exit was last measured."
          value={lastChecked()}
        />
        <Row
          label="Path"
          tip="Value of the best path found; below 90% counts as a weak route."
          value={pathValue()}
        />
        <Row
          label="Relays"
          tip="Distinct first relays over the paths found; more means fewer single points of failure."
          value={relays()}
        />
        <Row
          label="Route"
          value={formatRouting(props.destinationState.destination.hops)}
        />
        <Row label="Open spots" value={openSpots()} />
        <Row label="Reliability" value={reliability()} />
      </div>
      <div class="flex flex-col gap-2 border-t border-line pt-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 text-[13px] leading-5 text-text-soft">
            Usage
            <FeatureComing>
              <InfoDot label="Usage per exit: feature coming" />
            </FeatureComing>
          </span>
          <span class="text-[13px] leading-5 text-text-subtle">
            <span class="font-figures text-[15px] leading-5 font-semibold text-text-primary">
              {`${MB_PER_EXIT} MB`}
            </span>{" "}
            left
          </span>
        </div>
        <div class="h-2 overflow-hidden rounded bg-control-bg">
          <div class="h-full w-full rounded bg-control-tint" />
        </div>
      </div>
    </div>
  );
}
