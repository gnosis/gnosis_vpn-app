import {
  createMemo,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { isRunningRunMode } from "@src/services/vpnService.ts";
import { fromWeiToFixed } from "@src/utils/wei.ts";
import { deriveSafeStatus, deriveNodeStatus, type StatusText } from "@src/utils/funding.ts";
import {
  computeEffectiveCredit,
  formatCredit,
  sumCapacityStake,
} from "@src/utils/credit.ts";
import { useAppStore } from "@src/stores/appStore.ts";

type Props = {
  show: boolean;
  buttonRect: DOMRect | null;
  containerRect: DOMRect | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

function StatusDot(props: { status: StatusText }) {
  return (
    <div
      class={`w-2 h-2 rounded-full ${
        props.status === "Sufficient" ? "bg-emerald-500" : "bg-red-500"
      }`}
    >
    </div>
  );
}

export default function BalancePopup(props: Props) {
  const [appState] = useAppStore();

  const fundingIssues = createMemo(() =>
    isRunningRunMode(appState.runMode)
      ? (appState.runMode.Running.funding_issues ?? [])
      : []
  );

  const effectiveCredit = createMemo(() => {
    const b = appState.balance;
    if (!b) return null;
    return computeEffectiveCredit(b.capacity_allocations ?? []);
  });

  const totalWxhopr = createMemo(() => {
    const b = appState.balance;
    if (!b?.capacity_allocations) return 0n;
    return sumCapacityStake(b.capacity_allocations);
  });

  return (
    <Show
      when={props.show && props.buttonRect && props.containerRect}
    >
      <Portal>
        <div
          class="fixed z-100"
          style={{
            top: `${props.buttonRect!.bottom + 12}px`,
            left: `${props.buttonRect!.left + props.buttonRect!.width / 2}px`,
          }}
          onMouseEnter={props.onMouseEnter}
          onMouseLeave={props.onMouseLeave}
        >
          <div
            class="absolute -translate-x-1/2"
            style={{
              top: "-6px",
              left: "0",
              width: "0",
              height: "0",
              "border-left": "6px solid transparent",
              "border-right": "6px solid transparent",
              "border-bottom": "6px solid var(--color-accent)",
            }}
          />

          <div
            class="bg-accent text-accent-text rounded-lg shadow-2xl px-3 py-2.5 -translate-x-1/2"
            style={{ width: `150px` }}
          >
            <div class="text-xs font-medium mb-2 text-accent-text/70">
              Funds remaining
            </div>

            <div class="mb-2">
              <div class="flex items-center gap-1 mb-0.5">
                <StatusDot status={deriveSafeStatus(fundingIssues())} />
                <div class="text-[9px] text-accent-text/70 uppercase tracking-wide">
                  TRAFFIC
                </div>
              </div>
              <Show
                when={appState.balance}
                fallback={
                  <div class="text-[10px] text-accent-text/70">Loading...</div>
                }
              >
                <div
                  class={`flex items-baseline justify-end gap-1 text-sm font-bold font-mono ${
                    deriveSafeStatus(fundingIssues()) === "Empty" ? "text-red-500" : ""
                  }`}
                >
                  <span>
                    {fromWeiToFixed(totalWxhopr())}
                  </span>
                  <span
                    class="text-[10px] inline-block text-left"
                    style={{ width: "34px" }}
                  >
                    wxHOPR
                  </span>
                </div>
                <div class="text-[10px] text-accent-text/50 font-mono text-right">
                  {effectiveCredit() !== null
                    ? `≈${formatCredit(effectiveCredit()!)}`
                    : "—"}
                </div>
              </Show>
            </div>

            <div>
              <div class="flex items-center gap-1 mb-0.5">
                <StatusDot status={deriveNodeStatus(fundingIssues())} />
                <div class="text-[9px] text-accent-text/70 uppercase tracking-wide">
                  CUSTOM EXIT NODES
                </div>
              </div>
              <Show
                when={appState.balance}
                fallback={
                  <div class="text-[10px] text-accent-text/70">Loading...</div>
                }
              >
                {(b) => (
                  <div class="flex items-baseline justify-end gap-1 text-sm font-bold font-mono">
                    <span>{fromWeiToFixed(b().node)}</span>
                    <span
                      class="text-[10px] inline-block text-left"
                      style={{ width: "34px" }}
                    >
                      xDAI
                    </span>
                  </div>
                )}
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
