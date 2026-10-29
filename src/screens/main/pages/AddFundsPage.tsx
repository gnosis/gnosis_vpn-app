import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import AddressQr from "@src/components/address/AddressQr.tsx";
import { Section } from "@src/components/common/GroupedList.tsx";
import Tooltip from "@src/components/common/Tooltip.tsx";
import {
  isPreparingSafeRunMode,
  isRunningRunMode,
  VPNService,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
import { sumCapacityStake } from "@src/utils/credit.ts";
import {
  deriveNodeStatus,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  deriveXdaiDeficit,
  type StatusText,
} from "@src/utils/funding.ts";
import { FUNDING_COPY, FUNDING_TOOL_URL } from "@src/utils/fundingCopy.ts";
import {
  formatWxhopr,
  formatXdai,
  humanWxhopr,
  humanXdai,
  wxhoprDecimal,
} from "@src/utils/hopli.ts";
import {
  type Balances,
  IDLE,
  observe,
  startWaiting,
  type TransferWatch,
  wantsFastPolling,
} from "@src/utils/transferWatch.ts";

const COPIED_MS = 2000;

const statusClass: Record<string, string> = {
  Sufficient: "text-text-green",
  Low: "text-text-orange",
  Empty: "text-text-red",
};

function GnosisChainMark() {
  return (
    <span
      class="flex size-5 shrink-0 items-center justify-center rounded-full bg-owl text-[11px] font-bold text-bg-primary"
      aria-hidden="true"
    >
      G
    </span>
  );
}

/** The exact value only when the rounded display does not already spell it out. */
function exactOrNull(exact: string, rounded: string): string | null {
  return exact === rounded ? null : exact;
}

/** One "what to send" row: token, purpose, balance, status, and the deficit hint when there is one. */
function TokenRow(props: {
  name: string;
  purpose: string;
  balance: string;
  status: StatusText;
  hint?: { amount: string; exact: string | null } | null;
}) {
  const hintText = (): JSX.Element => (
    <>
      {FUNDING_COPY.sendAtLeast.before}
      <span class="font-bold">{props.hint!.amount}</span>
      {FUNDING_COPY.sendAtLeast.after}
    </>
  );
  return (
    <div class="flex flex-col gap-2 px-3 py-2.5">
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col">
          <span class="text-sm font-bold text-text-primary">{props.name}</span>
          <span class="text-xs text-text-secondary">{props.purpose}</span>
        </div>
        <div class="flex flex-col items-end">
          <span class="select-text font-mono text-base text-text-primary">
            {props.balance}
          </span>
          <span class="text-xs text-text-secondary">now</span>
          <span
            class={`text-xs font-bold ${
              statusClass[props.status] ?? "text-text-secondary"
            }`}
          >
            {props.status}
          </span>
        </div>
      </div>
      <Show when={props.hint}>
        {(hint) => (
          <div class="rounded-md bg-vpn-orange/15 px-2.5 py-1.5 text-xs text-text-orange">
            <Show
              when={hint().exact}
              fallback={<span>{hintText()}</span>}
            >
              {(exact) => (
                <Tooltip content={<span>{exact()}</span>} position="auto">
                  <span class="cursor-help">{hintText()}</span>
                </Tooltip>
              )}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

/** Where to send funds, what to send, and whether they have arrived. */
export default function AddFundsPage() {
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
  const address = () =>
    (preparingSafe()?.node_address ?? appState.balance?.info.node_address ??
      "").trim();
  const balances = createMemo((): Balances => ({
    wxhopr: preparingSafe()?.node_wxhopr ??
      (appState.balance ? sumCapacityStake(appState.balance) : 0n),
    xdai: preparingSafe()?.node_xdai ?? appState.balance?.node ?? 0n,
  }));
  const trafficStatus = () =>
    deriveTrafficStatus(appState.balance, runModeStatus());
  const gasStatus = () => deriveNodeStatus(appState.balance, runModeStatus());
  const wxhoprDeficit = () =>
    deriveWxhoprDeficit(appState.balance, runModeStatus()) ??
      deriveRefillShortfall(appState.balance, runModeStatus());
  const xdaiDeficit = () =>
    deriveXdaiDeficit(appState.balance, runModeStatus());

  const wxhoprHint = () => {
    const deficit = wxhoprDeficit();
    if (!deficit) return null;
    const rounded = formatWxhopr(deficit, 3, "ceil");
    return {
      amount: `${rounded} wxHOPR`,
      exact: exactOrNull(
        `${wxhoprDecimal(deficit)} wxHOPR`,
        `${rounded} wxHOPR`,
      ),
    };
  };
  const xdaiHint = () => {
    const deficit = xdaiDeficit();
    if (!deficit) return null;
    const rounded = formatXdai(deficit, 3, "ceil");
    return {
      amount: `${rounded} xDAI`,
      exact: exactOrNull(`${formatXdai(deficit, 18)} xDAI`, `${rounded} xDAI`),
    };
  };

  // Copy / funding tool start the wait; every balance update is observed against the snapshot.
  const [watch, setWatch] = createSignal<TransferWatch>(IDLE);
  const [copied, setCopied] = createSignal(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copiedTimer));

  const beginWaiting = () => {
    if (watch().phase === "received") return;
    setWatch(startWaiting(balances(), Date.now()));
  };
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address());
      setCopied(true);
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => setCopied(false), COPIED_MS);
      beginWaiting();
    } catch (error) {
      logWarn(`Error copying address: ${String(error)}`);
    }
  };
  const openFundingTool = async () => {
    try {
      await openUrl(FUNDING_TOOL_URL);
      beginWaiting();
    } catch (error) {
      logWarn(`Error opening the funding tool: ${String(error)}`);
    }
  };

  createEffect(on(balances, (b) => setWatch((w) => observe(w, b, Date.now()))));
  // The 15 minute fallback needs a clock, not just balance updates.
  const tick = setInterval(
    () => setWatch((w) => observe(w, balances(), Date.now())),
    10_000,
  );
  onCleanup(() => clearInterval(tick));

  // Faster balance polling only while waiting; off again when the page is left.
  createEffect(on(() => wantsFastPolling(watch()), (fast) => {
    VPNService.setBalancePollFast(fast).catch((e) => logWarn(`${e}`));
    if (fast) logInfo("Waiting for a transfer: balance polling sped up");
  }));
  onCleanup(() => {
    VPNService.setBalancePollFast(false).catch((e) => logWarn(`${e}`));
  });

  const receivedText = () => {
    const w = watch();
    if (w.phase !== "received") return null;
    return w.token === "wxhopr"
      ? {
        title: FUNDING_COPY.received.title(humanWxhopr(w.delta)),
        detail: FUNDING_COPY.received.traffic(humanWxhopr(w.balance)),
      }
      : {
        title: FUNDING_COPY.received.title(`${humanXdai(w.delta)} xDAI`),
        detail: FUNDING_COPY.received.gas(`${humanXdai(w.balance)} xDAI`),
      };
  };

  return (
    <>
      <div class="flex gap-4 rounded-xl border border-border bg-bg-surface p-3">
        <Show
          when={address()}
          fallback={
            <span class="text-sm text-text-red">
              No Gnosis VPN address found
            </span>
          }
        >
          <AddressQr address={address()} sizePx={104} />
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <span class="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
              {FUNDING_COPY.addressLabel}
            </span>
            <span class="select-text break-all font-mono text-xs leading-snug text-text-primary">
              {address()}
            </span>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="h-8 rounded-md border border-border bg-bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => void copyAddress()}
              >
                {/* Both labels share one cell so the swap never resizes the button and shifts its neighbour. */}
                <span class="grid">
                  <span
                    class="col-start-1 row-start-1"
                    classList={{ invisible: copied() }}
                  >
                    {FUNDING_COPY.copy}
                  </span>
                  <span
                    class="col-start-1 row-start-1"
                    classList={{ invisible: !copied() }}
                  >
                    {FUNDING_COPY.copied}
                  </span>
                </span>
              </button>
              <button
                type="button"
                class="h-8 rounded-md border border-border bg-bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => void openFundingTool()}
              >
                {FUNDING_COPY.fundingTool} <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </Show>
      </div>

      <p class="flex items-center gap-2 text-sm text-text-primary">
        <GnosisChainMark />
        <span>
          {FUNDING_COPY.networkLine.before}
          <span class="font-bold">{FUNDING_COPY.networkLine.network}</span>
          {FUNDING_COPY.networkLine.after}
        </span>
      </p>

      <Section title={FUNDING_COPY.whatToSend}>
        <TokenRow
          name={FUNDING_COPY.wxhopr.name}
          purpose={FUNDING_COPY.wxhopr.purpose}
          balance={formatWxhopr(balances().wxhopr, 2)}
          status={trafficStatus()}
          hint={wxhoprHint()}
        />
        <TokenRow
          name={FUNDING_COPY.xdai.name}
          purpose={FUNDING_COPY.xdai.purpose}
          balance={humanXdai(balances().xdai)}
          status={gasStatus()}
          hint={xdaiHint()}
        />
      </Section>

      <Switch>
        <Match when={receivedText()}>
          {(text) => (
            <div
              class="flex items-start gap-2.5 rounded-xl border border-vpn-light-green/40 bg-vpn-light-green/10 px-3 py-2.5"
              role="status"
            >
              <svg
                viewBox="0 0 16 16"
                class="mt-0.5 size-4 shrink-0 text-text-green"
                aria-hidden="true"
              >
                <path
                  d="M3 8.5l3.2 3.2L13 5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="flex flex-col text-sm">
                <span class="font-bold text-text-green">{text().title}</span>
                <span class="text-text-green">{text().detail}</span>
              </span>
            </div>
          )}
        </Match>
        <Match when={watch().phase === "waiting"}>
          <div
            class="flex items-start gap-2.5 rounded-xl border border-border bg-bg-surface px-3 py-2.5"
            role="status"
            aria-live="polite"
          >
            <span
              class="mt-0.5 size-4 shrink-0 animate-spin-smooth rounded-full border-2 border-border border-t-text-primary"
              aria-hidden="true"
            />
            <span class="flex flex-col text-sm">
              <span class="font-bold text-text-primary">
                {FUNDING_COPY.waiting.title}
              </span>
              <span class="text-text-secondary">
                {FUNDING_COPY.waiting.detail}
              </span>
            </span>
          </div>
        </Match>
        <Match when>
          <p class="text-sm text-text-secondary">{FUNDING_COPY.idle}</p>
        </Match>
      </Switch>
    </>
  );
}
