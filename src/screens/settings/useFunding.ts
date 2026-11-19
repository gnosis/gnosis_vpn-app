import { createMemo } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  isPreparingSafeRunMode,
  isRunningRunMode,
  warmupProgress,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  dataToSend,
  deriveNodeStatus,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  preparingSafeShortfall,
  resolveFundingStatus,
  type StatusText,
} from "@src/utils/funding.ts";
import { logWarn } from "@src/utils/appLog.ts";

const FUNDING_SITE_URL = "https://funding.vpn.gnosis.eth.limo/";

export async function openFundingSite(address: string) {
  const url = `${FUNDING_SITE_URL}?address=${encodeURIComponent(address)}`;
  try {
    await openUrl(url);
  } catch (e) {
    logWarn(`Failed to open ${url}: ${e}`);
  }
}

/** What the Usage tab and the Send funds page know about funding right now. */
export function useFunding() {
  const [appState] = useAppStore();

  const preparingSafe =
    () => (isPreparingSafeRunMode(appState.runMode) ? appState.runMode : null);
  // What stands in for the balance card while the service cannot report one.
  const standIn = createMemo(
    (): { tone: "warn" | "bad"; text: string } | null => {
      switch (appState.vpnStatus) {
        case "WorkerRestarting":
          return { tone: "warn", text: "Service restarting" };
        case "ServiceUnavailable":
          return { tone: "bad", text: "Service unavailable" };
        case "InUseByOtherUser":
          return {
            tone: "warn",
            text: "In use by another user on this computer",
          };
        case "DeployingSafe":
          return { tone: "warn", text: "Preparing service" };
      }
      return warmupProgress(appState.runMode)
        ? { tone: "warn", text: "Syncing in progress" }
        : null;
    },
  );
  const balanceShown = () =>
    standIn() === null &&
    (isRunningRunMode(appState.runMode) || preparingSafe() !== null);
  const runModeStatus = createMemo(() =>
    isRunningRunMode(appState.runMode) ? appState.runMode.funding_status : null
  );
  const nodeAddress = () =>
    preparingSafe()?.node_address ?? appState.balance?.info.node_address ?? "";

  // Running: only the levels the client reports, never the derive helpers' "Sufficient" default.
  const levelsKnown = () =>
    resolveFundingStatus(appState.balance, runModeStatus()) !== null;
  // Onboarding: Sufficient only once the node holds the client's full minimum.
  const preparingStatus = (token: "wxhopr" | "xdai"): StatusText | null => {
    const preparing = preparingSafe();
    if (!preparing?.balance_recommendation) return null;
    if (preparingSafeShortfall(preparing, token) === null) return "Sufficient";
    const have = token === "wxhopr"
      ? preparing.node_wxhopr
      : preparing.node_xdai;
    return have === 0n ? "Empty" : "Low";
  };
  const statuses = {
    wxhopr: createMemo(() => {
      if (preparingSafe()) return preparingStatus("wxhopr");
      return levelsKnown()
        ? deriveTrafficStatus(appState.balance, runModeStatus())
        : null;
    }),
    xdai: createMemo(() => {
      if (preparingSafe()) return preparingStatus("xdai");
      return levelsKnown()
        ? deriveNodeStatus(appState.balance, runModeStatus())
        : null;
    }),
  };
  /** A token's level as Send funds shows it; null while unknown. */
  const tokenStatus = (token: "wxhopr" | "xdai") => statuses[token]();

  /** wxHOPR to send while traffic is Low or Empty; null otherwise, or when the client names no amount. */
  const wxhoprShortfall = () => {
    const status = tokenStatus("wxhopr");
    if (status !== "Empty" && status !== "Low") return null;
    return preparingSafeShortfall(preparingSafe(), "wxhopr") ??
      deriveWxhoprDeficit(appState.balance, runModeStatus()) ??
      deriveRefillShortfall(appState.balance, runModeStatus());
  };
  /** That shortfall as data at the PIX price; null without one (onboarding, older services). */
  const dataShortfall = () => {
    const amount = wxhoprShortfall();
    const price =
      appState.balance?.capacity_allocations?.exit_traffic.price_per_byte ??
        0n;
    return amount === null ? null : dataToSend(amount, price);
  };

  return {
    preparingSafe,
    standIn,
    balanceShown,
    runModeStatus,
    nodeAddress,
    tokenStatus,
    wxhoprShortfall,
    dataShortfall,
  };
}
