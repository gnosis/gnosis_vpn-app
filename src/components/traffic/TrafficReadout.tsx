import { createSignal, onCleanup } from "solid-js";
import {
  formatRate,
  type RateFamily,
  rateScale,
} from "@src/utils/trafficFormat.ts";

/** About five updates a second stays readable. */
const UPDATE_MS = 200;
/** Seconds for a figure to cover about 63% of the way to the live rate. */
const EASE_SECONDS = 0.5;

interface TrafficReadoutProps {
  /** Bytes per second, already averaged over the capture window. */
  sent: number;
  received: number;
  /** False while nothing is being captured; the figures dim. */
  live: boolean;
}

/** Downstream and upstream in an inset track of two raised cells; a click switches units. */
export default function TrafficReadout(props: TrafficReadoutProps) {
  const [family, setFamily] = createSignal<RateFamily>("bits");
  const [down, setDown] = createSignal(0);
  const [up, setUp] = createSignal(0);
  const [downPeak, setDownPeak] = createSignal(0);
  const [upPeak, setUpPeak] = createSignal(0);

  const step = 1 - Math.exp(-UPDATE_MS / 1000 / EASE_SECONDS);
  const timer = setInterval(() => {
    const nextDown = down() + (props.received - down()) * step;
    const nextUp = up() + (props.sent - up()) * step;
    setDown(nextDown);
    setUp(nextUp);
    setDownPeak((peak) => Math.max(peak, nextDown));
    setUpPeak((peak) => Math.max(peak, nextUp));
  }, UPDATE_MS);
  onCleanup(() => clearInterval(timer));

  const cell = (
    label: string,
    dotClass: string,
    value: () => number,
    peak: () => number,
  ) => {
    // From the peak, so the figure and its peak share a unit and the unit settles once.
    const scale = () => rateScale(peak(), family());
    return (
      <div class="flex min-w-0 flex-col gap-0.5 rounded-[10px] bg-traffic-cell px-3 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
        <span class="flex items-center gap-1.5 font-mono text-[10px] tracking-[1.5px] text-text-muted">
          <span class={`size-2 rounded-full ${dotClass}`} aria-hidden="true" />
          {label}
        </span>
        <span class="flex items-baseline gap-x-1.5 whitespace-nowrap">
          <span
            class={`font-mono text-[38px] leading-none font-semibold tracking-[-0.04em] tabular-nums transition-colors duration-300 ${
              props.live ? "text-text-primary" : "text-text-muted/50"
            }`}
          >
            {formatRate(value(), scale())}
          </span>
          <span class="font-mono text-[11px] text-text-muted">
            {scale().unit}
          </span>
        </span>
        <span class="font-mono text-[10px] text-text-muted">
          peak {formatRate(peak(), scale())}
        </span>
      </div>
    );
  };

  return (
    <button
      type="button"
      title="Click to switch units"
      class="mx-auto mb-3 grid w-[calc(100%-40px)] max-w-95 cursor-default grid-cols-2 gap-1 rounded-[14px] bg-traffic-track p-1 text-left select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-traffic-gt"
      onClick={() => setFamily((f) => (f === "bits" ? "bytes" : "bits"))}
    >
      {cell("DOWNSTREAM", "bg-traffic-sync", down, downPeak)}
      {cell("UPSTREAM", "bg-traffic-sync-hi", up, upPeak)}
    </button>
  );
}
