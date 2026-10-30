import {
  createEffect,
  createMemo,
  type JSX,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  isPreparingSafeRunMode,
  isRunningRunMode,
  isWarmupRunMode,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  computeEffectiveCredit,
  formatCredit,
  sumCapacityStake,
} from "@src/utils/credit.ts";
import {
  deriveNodeStatus,
  deriveOverallStatus,
  deriveTrafficStatus,
  describeCriticalIssue,
  type StatusText,
} from "@src/utils/funding.ts";
import {
  formatXdai,
  humanWxhoprParts,
  humanXdai,
  wxhoprDecimal,
} from "@src/utils/hopli.ts";
import { isWindowFocused } from "@src/utils/windowFocus.ts";
import Button from "./common/Button.tsx";
import Tooltip from "./common/Tooltip.tsx";
import WarningIcon from "./icons/WarningIcon.tsx";
import type { PickerFrame } from "./exitNode/LocationPicker.tsx";

const MARGIN_PX = 8;
const GAP_PX = 10;
const ARROW_PX = 12;
const DEFAULT_WIDTH_PX = 296;

const statusClass: Record<string, string> = {
  Sufficient: "text-text-green",
  Low: "text-text-orange",
  Empty: "text-text-red",
};

function StatusLabel(props: { status: StatusText }) {
  return (
    <span
      class={`text-xs font-bold ${
        statusClass[props.status] ?? "text-text-secondary"
      }`}
    >
      {props.status}
    </span>
  );
}

/** One balance row: label and subline on the left, amount, unit and status on the right. */
function BalanceRow(props: {
  label: string;
  subline?: JSX.Element;
  amount: string;
  unit: string;
  exact: string;
  status: StatusText;
}) {
  return (
    <div class="flex items-start justify-between gap-3 py-1.5">
      <div class="flex flex-col">
        <span class="text-sm text-text-primary">{props.label}</span>
        <Show when={props.subline}>
          <span class="text-xs text-text-secondary">{props.subline}</span>
        </Show>
      </div>
      <div class="flex flex-col items-end">
        <Tooltip
          content={<span>{props.exact}</span>}
          position="auto"
          align="end"
        >
          <span class="cursor-help select-text font-mono text-base text-text-primary">
            {props.amount}
            <span class="ml-1 font-sans text-sm font-bold">{props.unit}</span>
          </span>
        </Tooltip>
        <StatusLabel status={props.status} />
      </div>
    </div>
  );
}

/** The wallet icon's popover: both balances, the service's state in one line, and the way to add funds. */
export default function WalletPopover(props: {
  anchor: DOMRect;
  frame: PickerFrame | null;
  onClose: () => void;
  onAddFunds: () => void;
  // The opening button; presses on it are left to its own toggle.
  trigger?: HTMLElement;
}) {
  const [appState] = useAppStore();

  const preparingSafe = () =>
    isPreparingSafeRunMode(appState.runMode)
      ? appState.runMode.PreparingSafe
      : null;
  const runModeStatus = createMemo(() =>
    isRunningRunMode(appState.runMode)
      ? appState.runMode.Running.funding_status
      : null
  );
  const effectiveCredit = createMemo(() =>
    appState.balance ? computeEffectiveCredit(appState.balance) : null
  );
  const wxhoprRaw = () =>
    preparingSafe()?.node_wxhopr ??
      (appState.balance ? sumCapacityStake(appState.balance) : 0n);
  const xdaiRaw = () =>
    preparingSafe()?.node_xdai ?? appState.balance?.node ?? 0n;
  const trafficStatus = createMemo(() =>
    deriveTrafficStatus(appState.balance, runModeStatus())
  );
  const gasStatus = createMemo(() =>
    deriveNodeStatus(appState.balance, runModeStatus())
  );
  const overallStatus = createMemo(() =>
    deriveOverallStatus(appState.balance, runModeStatus())
  );
  const loading = () => appState.balance === null;
  const wxhopr = () => humanWxhoprParts(wxhoprRaw());

  // The state line: what Usage showed as banners, compressed to one line.
  const stateLine = createMemo(
    (): { text: string; critical: boolean } | null => {
      const status = appState.vpnStatus;
      if (status === "WorkerRestarting") {
        return { text: "Service restarting", critical: false };
      }
      if (status === "ServiceUnavailable") {
        return { text: "Service unavailable", critical: true };
      }
      if (status === "InUseByOtherUser") {
        return {
          text: "In use by another user on this computer",
          critical: false,
        };
      }
      if (status === "DeployingSafe") {
        return { text: "Preparing service", critical: false };
      }
      if (isWarmupRunMode(appState.runMode)) {
        return { text: "Syncing in progress", critical: false };
      }
      if (preparingSafe()) {
        return { text: "Waiting for incoming funds", critical: false };
      }
      if (overallStatus() !== "Sufficient") {
        const issue = describeCriticalIssue(appState.balance, runModeStatus());
        if (issue) {
          return {
            text: issue,
            critical: overallStatus() === "Empty" && !loading(),
          };
        }
      }
      return null;
    },
  );

  let popoverRef: HTMLDivElement | undefined;

  // Esc, a press outside, or the window losing focus closes it.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    props.onClose();
  };
  const onPointerDown = (e: PointerEvent) => {
    const target = e.target instanceof Node ? e.target : null;
    if (target && popoverRef?.contains(target)) return;
    // Closing here would let the same click reopen it.
    if (target && props.trigger?.contains(target)) return;
    props.onClose();
  };
  onMount(() => {
    document.addEventListener("keydown", onKeyDown, true);
    // next tick: the opening click must not count as outside
    setTimeout(
      () => document.addEventListener("pointerdown", onPointerDown),
      0,
    );
  });
  onCleanup(() => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onPointerDown);
  });
  createEffect(() => {
    if (!isWindowFocused()) props.onClose();
  });

  // Same placement rules as the location picker: right-aligned under the icon, inside the column.
  const width = () =>
    Math.min(DEFAULT_WIDTH_PX, props.frame?.width ?? DEFAULT_WIDTH_PX);
  const anchorX = () => props.anchor.left + props.anchor.width / 2;
  const left = () => {
    const rightEdge = props.frame
      ? props.frame.left + props.frame.width
      : globalThis.innerWidth - MARGIN_PX;
    return Math.max(MARGIN_PX, rightEdge - width());
  };
  const top = () => props.anchor.bottom + GAP_PX;
  const arrowLeft = () => anchorX() - left() - ARROW_PX / 2;

  return (
    <Portal>
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Balance"
        class="fixed z-100 flex flex-col gap-2 rounded-xl border border-border bg-bg-surface p-4 shadow-xl transition-[opacity,transform] duration-150 ease-out starting:-translate-y-1 starting:opacity-0"
        style={{
          left: `${left()}px`,
          top: `${top()}px`,
          width: `${width()}px`,
        }}
      >
        <span
          class="absolute -top-[7px] size-3 rotate-45 border-l border-t border-border bg-bg-surface"
          style={{ left: `${arrowLeft()}px` }}
          aria-hidden="true"
        />
        <h2 class="text-base font-bold text-text-primary">Balance</h2>
        <Show when={stateLine()}>
          {(line) => (
            <p
              class={`flex items-center gap-1.5 text-xs ${
                line().critical ? "text-text-red" : "text-text-orange"
              }`}
            >
              <WarningIcon filled />
              <span>{line().text}</span>
            </p>
          )}
        </Show>
        <Switch>
          <Match when={loading()}>
            {/* Skeleton rows, as the Usage tab's pulse placeholder. */}
            <div class="flex flex-col gap-3 py-1" aria-busy="true">
              <div class="h-9 w-full animate-pulse rounded bg-bg-surface-alt" />
              <div class="h-9 w-full animate-pulse rounded bg-bg-surface-alt" />
            </div>
          </Match>
          <Match when>
            <div class="flex flex-col divide-y divide-border">
              <BalanceRow
                label="Traffic"
                subline={
                  <Show
                    when={effectiveCredit() !== null &&
                      isRunningRunMode(appState.runMode)}
                  >
                    ≈ {formatCredit(effectiveCredit()!)} left
                  </Show>
                }
                amount={wxhopr().amount}
                unit="wxHOPR"
                exact={`${wxhoprDecimal(wxhoprRaw())} wxHOPR`}
                status={trafficStatus()}
              />
              <BalanceRow
                label="Gas fees"
                amount={humanXdai(xdaiRaw())}
                unit="xDAI"
                exact={`${formatXdai(xdaiRaw(), 18)} xDAI`}
                status={gasStatus()}
              />
            </div>
          </Match>
        </Switch>
        <Button size="main" onClick={props.onAddFunds}>Add funds…</Button>
      </div>
    </Portal>
  );
}
