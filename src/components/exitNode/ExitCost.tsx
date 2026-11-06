import { Show } from "solid-js";
import type { Destination } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { cancelExitCost, confirmExitCost } from "@src/stores/exitCost.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import {
  BYTES_PER_MB,
  computeEffectiveCredit,
  formatCreditCompact,
  MB_PER_EXIT,
} from "@src/utils/credit.ts";
import { exitDisplayName, exitShortId } from "@src/utils/destinations.ts";
import Flag from "../Flag.tsx";
import FeatureComing from "../settings/FeatureComing.tsx";
import { ShortId } from "./LocationRow.tsx";

// The Stage 2.1 mock's quota graphic: a 330×74 stage, the balance as a battery 244 wide.
const W = 244;
const X0 = 6;
const EXIT_X = 288;
const COST = MB_PER_EXIT * BYTES_PER_MB;

const FAINT = "var(--color-status-idle)";
const TINT = "var(--color-control-tint)";

/** A drawn box: WebKit's native checkbox renders oddly once checked. */
function Checkbox(props: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <span class="relative flex size-4 shrink-0">
      <input
        type="checkbox"
        class="peer size-4 appearance-none rounded-[4px] border border-control-ring checked:border-control-tint checked:bg-control-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-control-tint"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange?.(e.currentTarget.checked)}
      />
      <svg
        viewBox="0 0 16 16"
        class="pointer-events-none absolute inset-0 hidden size-4 text-bg-location-card peer-checked:block"
        aria-hidden="true"
      >
        <path
          d="M4 8.5l2.5 2.5L12 5.5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
  );
}

/** Before a connect: what the exit sets aside from the balance, and the user's go-ahead. */
export default function ExitCost(
  props: { destination: Destination; switching: boolean },
) {
  const [appState] = useAppStore();
  const [settings, settingsActions] = useSettingsStore();

  const credit = () =>
    appState.balance ? computeEffectiveCredit(appState.balance) : null;
  const left = () => {
    const c = credit();
    if (c === null) return null;
    return c > COST ? c - COST : 0n;
  };
  const total = () => {
    const c = credit();
    return c === null || c === 0n ? COST : c;
  };
  const leftWidth = () => {
    const l = left();
    return l === null ? W : (Number(l) / Number(total())) * W;
  };
  const chunkWidth = () => Math.max(36, (Number(COST) / Number(total())) * W);
  const chunkX = () => Math.min(X0 + leftWidth(), W + 6 - chunkWidth());

  return (
    <div class="flex flex-col gap-1.5 border-t border-dashed border-line-dash px-3 pt-3.5 pb-3">
      <div class="relative aspect-[330/74] w-full" aria-hidden="true">
        <svg
          viewBox="0 0 330 74"
          class="absolute inset-0 size-full overflow-visible font-figures text-[10px]"
        >
          <rect
            x="2"
            y="22"
            width={W + 8}
            height="32"
            rx="8"
            fill="none"
            stroke={FAINT}
            stroke-width="1.5"
          />
          <rect x={W + 12} y="31" width="4" height="14" rx="1.5" fill={FAINT} />
          <rect
            x={X0}
            y="26"
            width={Math.max(0, leftWidth() - 2)}
            height="24"
            rx="4"
            fill="var(--color-bar-off)"
          />
          <rect
            x={chunkX()}
            y="26"
            width={chunkWidth()}
            height="24"
            rx="4"
            fill={TINT}
            opacity="0.18"
          />
          {/* The distance to the exit is set per layout, which no utility class can express */}
          <rect
            x={chunkX()}
            y="26"
            width={chunkWidth()}
            height="24"
            rx="4"
            fill={TINT}
            class="motion-safe:animate-exit-cost"
            style={{ "--dx": `${EXIT_X + 2 - chunkX()}px` }}
          />
          <text
            x={chunkX() + chunkWidth() / 2}
            y="16"
            text-anchor="middle"
            font-weight="700"
            class="fill-ok-ink dark:fill-status-ok"
          >
            {`${MB_PER_EXIT} MB`}
          </text>
          <path
            d={`M${W + 22} 38h12m-5-5 5 5-5 5`}
            fill="none"
            stroke={FAINT}
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <Show when={left()}>
            {(l) => (
              <text
                x={X0 + leftWidth() / 2}
                y="70"
                text-anchor="middle"
                fill="var(--color-text-subtle)"
              >
                {`${formatCreditCompact(l())} left`}
              </text>
            )}
          </Show>
        </svg>
        {/* The exit's flag where the mock draws its icon: left 288, top 24, 38×28 of the 330×74 stage */}
        <Flag
          code={props.destination.geo?.country ?? ""}
          sizeClass="absolute left-[87.27%] top-[32.43%] h-[37.84%] w-[11.52%] rounded-[5px]"
        />
      </div>

      <p class="text-center text-sm font-bold">
        {exitDisplayName(props.destination)}
        <ShortId id={exitShortId(props.destination.address)} /> gets{" "}
        {MB_PER_EXIT.toString()} MB
      </p>

      <div class="mt-1 flex flex-col gap-1.5 self-center text-xs text-text-soft">
        <FeatureComing>
          <label class="flex items-center gap-2 opacity-50">
            <Checkbox checked={false} disabled />
            Turn on Auto-renew
          </label>
        </FeatureComing>
        <label class="flex items-center gap-2">
          {/* The same setting as "Hide data use before connecting", written at once */}
          <Checkbox
            checked={!settings.showExitCost}
            onChange={(hide) => void settingsActions.setShowExitCost(!hide)}
          />
          Do not show this again
        </label>
      </div>

      <div class="mt-1.5 flex gap-2">
        <button
          type="button"
          class="h-11 flex-1 rounded-[10px] text-[15px] font-bold hover:bg-control-bg"
          onClick={cancelExitCost}
        >
          Cancel
        </button>
        <button
          type="button"
          class="h-11 flex-1 rounded-[10px] bg-btn-connect-bg text-[15px] font-bold text-btn-connect-text hover:bg-btn-connect-hover"
          onClick={confirmExitCost}
        >
          {props.switching ? "Switch" : "Connect"}
        </button>
      </div>
    </div>
  );
}
