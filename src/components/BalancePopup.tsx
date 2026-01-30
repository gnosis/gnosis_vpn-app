import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { type BalanceResponse, VPNService } from "@src/services/vpnService.ts";
import { fromWeiToFixed } from "@src/utils/units.ts";
import {
  calculateGlobalFundingStatus,
  type GlobalFundingStatus,
  type StatusText,
} from "@src/utils/funding.ts";

const BALANCE_REFRESH_INTERVAL_MS = 60000;

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
  const [balance, setBalance] = createSignal<BalanceResponse | null>(null);
  const [fundingStatus, setFundingStatus] = createSignal<GlobalFundingStatus>({
    overall: "Sufficient",
    safeStatus: "Sufficient",
    nodeStatus: "Sufficient",
  });

  const loadBalance = async () => {
    try {
      const result = await VPNService.balance();
      setBalance(result);
      if (result) {
        const status = calculateGlobalFundingStatus(result.issues, {
          safe: result.safe,
          node: result.node,
        });
        setFundingStatus(status);
      }
    } catch (error) {
      console.error("Error loading balance:", error);
    }
  };

  onMount(() => {
    void loadBalance();
    const interval = setInterval(() => {
      void loadBalance();
    }, BALANCE_REFRESH_INTERVAL_MS);

    onCleanup(() => clearInterval(interval));
  });

  const getArrowLeftPosition = () => {
    if (!props.buttonRect || !props.containerRect) return "50%";

    const wrapperLeft = props.containerRect.left +
      props.containerRect.width / 2;
    const buttonCenter = props.buttonRect.left + props.buttonRect.width / 2;

    const offset = buttonCenter - wrapperLeft;

    return `${offset}px`;
  };

  return (
    <Show
      when={props.show && balance() && props.buttonRect && props.containerRect}
    >
      <Portal>
        <div
          class="fixed z-100"
          style={{
            top: `${props.buttonRect!.bottom + 12}px`,
            left: `${
              props.containerRect!.left + props.containerRect!.width / 2
            }px`,
          }}
          onMouseEnter={props.onMouseEnter}
          onMouseLeave={props.onMouseLeave}
        >
          <div
            class="absolute -translate-x-1/2"
            style={{
              top: "-6px",
              left: getArrowLeftPosition(),
              width: "0",
              height: "0",
              "border-left": "6px solid transparent",
              "border-right": "6px solid transparent",
              "border-bottom": "6px solid var(--color-accent)",
            }}
          />

          <div
            class="bg-accent text-accent-text rounded-lg shadow-2xl px-3 py-2.5 -translate-x-1/2"
            style={{
              width: `${props.containerRect!.width}px`,
            }}
          >
            <div class="text-xs font-medium mb-2 text-accent-text/70">
              Funds remaining
            </div>

            <div class="mb-2">
              <div class="flex items-center gap-1 mb-0.5">
                <StatusDot status={fundingStatus().safeStatus} />
                <div class="text-[9px] text-accent-text/70 uppercase tracking-wide">
                  TRAFFIC
                </div>
              </div>
              <Show
                when={balance()}
                fallback={
                  <div class="text-[10px] text-accent-text/70">Loading...</div>
                }
              >
                {(b) => (
                  <div class="flex items-baseline gap-1 text-sm font-bold">
                    {fromWeiToFixed(b().safe)} wxHOPR
                  </div>
                )}
              </Show>
            </div>

            <div>
              <div class="flex items-center gap-1 mb-0.5">
                <StatusDot status={fundingStatus().nodeStatus} />
                <div class="text-[9px] text-accent-text/70 uppercase tracking-wide">
                  CUSTOM EXIT NODES
                </div>
              </div>
              <Show
                when={balance()}
                fallback={
                  <div class="text-[10px] text-accent-text/70">Loading...</div>
                }
              >
                {(b) => (
                  <div class="flex items-baseline gap-1 text-sm font-bold">
                    {fromWeiToFixed(b().node)} xDAI
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
