import { type JSX, Show } from "solid-js";
import type { RouteHealthView } from "@src/services/vpnService.ts";
import {
  type ExitData,
  MIN_PATH_VALUE,
  type RouteGrade,
} from "@src/utils/destinations.ts";
import {
  formatLatency,
  formatPathValue,
  formatRelays,
  formatRouting,
  formatSecondsAgo,
  getLastCheckedEpoch,
  getLatencyLevel,
  getLatencyMs,
  getSlotLoad,
  getSlotLoadLevel,
  type LoadLevel,
} from "@src/utils/exitHealth.ts";
import { type PickerVerdict } from "@src/utils/pickerVerdict.ts";

/** The tooltip's own ramp: the bubble is dark in both themes, so these are the dark-theme health colours. */
const levelClass: Record<LoadLevel, string> = {
  low: "text-vpn-light-green",
  medium: "text-vpn-yellow",
  high: "text-vpn-red",
};

function Row(props: { label: string; value: string | null; class?: string }) {
  return (
    <>
      <span class="text-gray-400">{props.label}</span>
      <span class={`text-right ${props.class ?? "text-gray-100"}`}>
        {props.value ?? "–"}
      </span>
    </>
  );
}

/** Headline, one line of context and the numbers behind a route, for the picker's bars. */
export default function RouteTooltip(props: {
  verdict: PickerVerdict;
  grade: RouteGrade;
  routeHealth: RouteHealthView | null;
  exit: ExitData | null;
  /** The tunnel's own sample, once connected through this exit. */
  tunnelRtt: number | null;
  routing: number;
  connected: boolean;
  nowSec: number;
}): JSX.Element {
  const latencyMs = () => getLatencyMs(props.exit, props.tunnelRtt);
  // A value is coloured only when it explains the verdict.
  const latencyClass = () => {
    const ms = latencyMs();
    if (ms === null) return undefined;
    const level = getLatencyLevel(ms);
    if (level === "low") {
      return props.grade.kind === "measured" ? levelClass.low : undefined;
    }
    return levelClass[level];
  };
  const load = () => getSlotLoad(props.exit);
  const loadClass = () => {
    const l = load();
    if (!l) return undefined;
    const level = getSlotLoadLevel(l.percent);
    if (level === "low") {
      return props.grade.kind === "measured" ? levelClass.low : undefined;
    }
    return levelClass[level];
  };
  const pathClass = () => {
    const walk = props.routeHealth?.walk;
    if (walk?.found !== "Paths") return undefined;
    return walk.best_value < MIN_PATH_VALUE ? levelClass.medium : undefined;
  };
  const checked = () => {
    if (!props.routeHealth) return null;
    const epoch = getLastCheckedEpoch(props.routeHealth, props.exit);
    if (epoch === null) return null;
    return formatSecondsAgo(Math.max(0, Math.round(props.nowSec - epoch)));
  };

  return (
    <div class="w-56">
      <div class="flex items-baseline justify-between gap-3">
        <span class="font-bold text-white">{props.verdict.headline}</span>
        <Show when={props.connected}>
          <span class="rounded-full bg-vpn-light-green/20 px-1.5 text-[11px] font-bold text-vpn-light-green">
            Connected
          </span>
        </Show>
      </div>
      <p class="mt-0.5 text-gray-300">{props.verdict.context}</p>
      <div class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 border-t border-white/15 pt-2">
        <Row
          label="Latency"
          value={formatLatency(props.exit, props.tunnelRtt)}
          class={latencyClass()}
        />
        <Row
          label="Server load"
          value={load() ? `${load()!.percent}%` : null}
          class={loadClass()}
        />
        <Row
          label="Route score"
          value={props.routeHealth ? formatPathValue(props.routeHealth) : null}
          class={pathClass()}
        />
        <Row
          label="Relays"
          value={props.routeHealth ? formatRelays(props.routeHealth) : null}
        />
        <Row
          label="Route"
          value={formatRouting(props.routing).replace("-", " ")}
        />
        <Row label="Checked" value={checked()} />
      </div>
    </div>
  );
}
