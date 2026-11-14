import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import QRCodeGenerator from "qrcode";
import { useAppStore } from "@src/stores/appStore.ts";
import { logWarn } from "@src/utils/appLog.ts";
import { sumCapacityStake } from "@src/utils/credit.ts";
import {
  deriveNodeStatus,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  deriveXdaiDeficit,
  preparingSafeShortfall,
  resolveFundingStatus,
  roundUpToStep,
  type StatusText,
  WXHOPR_SEND_STEP,
} from "@src/utils/funding.ts";
import {
  formatWxhopr,
  formatXdai,
  humanWxhoprParts,
  humanXdai,
} from "@src/utils/hopli.ts";
import SettingIcon from "@src/components/icons/SettingIcon.tsx";
import {
  SettingsCard,
  SettingsHeading,
} from "@src/components/settings/SettingsGroup.tsx";
import { ROW_BUTTON } from "@src/components/settings/SettingsRow.tsx";
import SettingsSubpage from "./SettingsSubpage.tsx";
import { openFundingSite, useFunding } from "./useFunding.ts";

function AddressCard(props: { address: string }) {
  const [qrDataUrl, setQrDataUrl] = createSignal<string>();
  const [copied, setCopied] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copyTimeout));

  createEffect(() => {
    let cancelled = false;
    onCleanup(() => (cancelled = true));
    // Dark on white in both themes: wallets scan that most reliably.
    QRCodeGenerator.toDataURL(props.address, { margin: 0, width: 208 })
      .then((url) => !cancelled && setQrDataUrl(url))
      .catch((e) => logWarn(`Send funds: QR code failed: ${String(e)}`));
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.address);
      setCopied(true);
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      logWarn(`Error copying address: ${String(e)}`);
    }
  }

  return (
    <div class="flex shrink-0 gap-3.5 rounded-xl bg-bg-list p-3">
      <div class="size-26 shrink-0 rounded-lg bg-white p-1.5">
        <Show when={qrDataUrl()}>
          {(url) => (
            <img
              src={url()}
              alt="QR code of your VPN address"
              class="size-full"
            />
          )}
        </Show>
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="text-xs leading-4 text-text-subtle">
          Your VPN address
        </span>
        <span class="cursor-text font-figures text-[11px] leading-4 break-all text-address-ink select-text">
          {props.address}
        </span>
        <div class="mt-auto flex gap-1.5 pt-1.5">
          <button type="button" class={ROW_BUTTON} onClick={() => void copy()}>
            {/* Both labels share one cell, so the button keeps the wider one's width. */}
            <span class="inline-grid">
              <span
                class={`col-start-1 row-start-1 ${copied() ? "invisible" : ""}`}
              >
                Copy
              </span>
              <span
                class={`col-start-1 row-start-1 ${copied() ? "" : "invisible"}`}
              >
                Copied
              </span>
            </span>
          </button>
          <button
            type="button"
            class={ROW_BUTTON}
            onClick={() => void openFundingSite(props.address)}
          >
            Funding site <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TokenRow(props: {
  token: string;
  purpose: string;
  amount: string;
  status: StatusText | null;
  statusClass: string;
  sendAtLeast: string | null;
}) {
  return (
    <div class="flex flex-col gap-1 px-3.5 py-2.5">
      <div class="flex items-center gap-3">
        <span class="min-w-0 flex-1 text-[13px] leading-4.5">
          <span class="font-bold">{props.token}</span>
          <small class="mt-0.5 block text-xs leading-normal text-text-subtle">
            {props.purpose}
          </small>
        </span>
        <span class="flex shrink-0 flex-col items-end">
          <span class="cursor-text font-figures text-[13px] leading-4.5 font-semibold select-text">
            {props.amount}
          </span>
          <Show when={props.status}>
            {(status) => (
              <span
                class={`mt-0.5 text-[11px] leading-4 font-bold ${props.statusClass}`}
              >
                {status()}
              </span>
            )}
          </Show>
        </span>
      </div>
      <Show when={props.sendAtLeast}>
        {(amount) => (
          <span class="text-xs leading-normal text-text-soft">
            Send at least{" "}
            <span class="cursor-text font-figures font-bold text-text-primary select-text">
              {amount()}
            </span>{" "}
            {props.token}
          </span>
        )}
      </Show>
    </div>
  );
}

/** The address, QR code and what each token is for, opened from Usage → Add funds directly or the onboarding Fund screen. */
export default function SendFundsPage(props: { onBack: () => void }) {
  const [appState] = useAppStore();
  const funding = useFunding();

  // Opened only while the balance card shows, and leaves with it.
  createEffect(() => {
    if (!funding.balanceShown()) props.onBack();
  });

  const wxhopr = createMemo(() =>
    funding.preparingSafe()?.node_wxhopr ??
      (appState.balance ? sumCapacityStake(appState.balance) : null)
  );
  const xdai = () =>
    funding.preparingSafe()?.node_xdai ?? appState.balance?.node ?? null;

  // Running: only the levels the client reports, never the derive helpers' "Sufficient" default.
  const levelsKnown = () =>
    resolveFundingStatus(appState.balance, funding.runModeStatus()) !== null;
  const preparingStatus = (token: "wxhopr" | "xdai"): StatusText | null => {
    const preparing = funding.preparingSafe();
    if (!preparing?.balance_recommendation) return null;
    if (preparingSafeShortfall(preparing, token) === null) return "Sufficient";
    const have = token === "wxhopr"
      ? preparing.node_wxhopr
      : preparing.node_xdai;
    return have === 0n ? "Empty" : "Low";
  };
  // Onboarding: Sufficient only once the node holds the client's full minimum.
  const trafficStatus = createMemo(() => {
    if (funding.preparingSafe()) return preparingStatus("wxhopr");
    return levelsKnown()
      ? deriveTrafficStatus(appState.balance, funding.runModeStatus())
      : null;
  });
  const gasStatus = createMemo(() => {
    if (funding.preparingSafe()) return preparingStatus("xdai");
    return levelsKnown()
      ? deriveNodeStatus(appState.balance, funding.runModeStatus())
      : null;
  });
  // The daemon's levels alone (before the first balance) are blind to EOA funds, so they only warrant amber; preparing_safe's node balances are exact.
  const statusClass = (status: StatusText | null) => {
    if (status === "Sufficient") return "text-ok-ink";
    if (
      status === "Empty" &&
      (appState.balance !== null || funding.preparingSafe() !== null)
    ) return "text-bad-ink";
    return "text-warn-ink";
  };

  const needsFunds = (status: StatusText | null) =>
    status === "Empty" || status === "Low";
  const wxhoprToSend = () => {
    if (!needsFunds(trafficStatus())) return null;
    // Onboarding shows the client's exact minimum; a running top-up reads better as a round amount.
    const onboarding = preparingSafeShortfall(
      funding.preparingSafe(),
      "wxhopr",
    );
    if (onboarding) return formatWxhopr(onboarding, 3, "ceil");
    const deficit = deriveWxhoprDeficit(
      appState.balance,
      funding.runModeStatus(),
    ) ?? deriveRefillShortfall(appState.balance, funding.runModeStatus());
    return deficit
      ? formatWxhopr(roundUpToStep(deficit, WXHOPR_SEND_STEP), 3, "ceil")
      : null;
  };
  const xdaiToSend = () => {
    if (!needsFunds(gasStatus())) return null;
    const deficit = preparingSafeShortfall(funding.preparingSafe(), "xdai") ??
      deriveXdaiDeficit(appState.balance, funding.runModeStatus());
    return deficit ? formatXdai(deficit, 3, "ceil") : null;
  };

  return (
    <SettingsSubpage title="Send funds directly" onBack={props.onBack}>
      <Show when={funding.nodeAddress()}>
        {(address) => <AddressCard address={address()} />}
      </Show>
      <p class="flex items-center gap-2.5 px-1 pt-1 text-xs leading-[1.45] text-text-subtle">
        <span
          aria-hidden="true"
          class="flex size-5 shrink-0 items-center justify-center rounded-full bg-text-primary text-[10px] font-bold text-bg-primary"
        >
          G
        </span>
        <span>
          Send on <b class="text-text-primary">Gnosis Chain</b>{" "}
          only. Other networks won't arrive.
        </span>
      </p>
      <SettingsHeading>What to send</SettingsHeading>
      <SettingsCard label="What to send">
        <TokenRow
          token="wxHOPR"
          purpose="Pays for your traffic"
          amount={wxhopr() === null ? "—" : humanWxhoprParts(wxhopr()).amount}
          status={trafficStatus()}
          statusClass={statusClass(trafficStatus())}
          sendAtLeast={wxhoprToSend()}
        />
        <TokenRow
          token="xDAI"
          purpose="Pays network fees"
          amount={xdai() === null ? "—" : humanXdai(xdai())}
          status={gasStatus()}
          statusClass={statusClass(gasStatus())}
          sendAtLeast={xdaiToSend()}
        />
      </SettingsCard>
      <p class="flex gap-2 px-1 pt-1 text-xs leading-[1.45] text-text-subtle">
        <span class="mt-px shrink-0">
          <SettingIcon name="info" size={14} />
        </span>
        <span>
          <b class="text-text-primary">Waiting for your payment.</b>{" "}
          Usually about 2 minutes.
        </span>
      </p>
    </SettingsSubpage>
  );
}
