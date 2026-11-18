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

/** What the Usage tab and the onboarding Fund screen know about funding right now. */
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
  /** wxHOPR's level; null while unknown. Onboarding: Sufficient only once the node holds the client's full minimum. */
  const wxhoprStatus = createMemo((): StatusText | null => {
    const preparing = preparingSafe();
    if (preparing) {
      if (!preparing.balance_recommendation) return null;
      if (preparingSafeShortfall(preparing) === null) return "Sufficient";
      return preparing.node_wxhopr === 0n ? "Empty" : "Low";
    }
    return levelsKnown()
      ? deriveTrafficStatus(appState.balance, runModeStatus())
      : null;
  });

  /** wxHOPR to send while traffic is Low or Empty; null otherwise, or when the client names no amount. */
  const wxhoprShortfall = () => {
    const status = wxhoprStatus();
    if (status !== "Empty" && status !== "Low") return null;
    return preparingSafeShortfall(preparingSafe()) ??
      deriveWxhoprDeficit(appState.balance, runModeStatus()) ??
      deriveRefillShortfall(appState.balance, runModeStatus());
  };
  /** That shortfall as data at the PIX price; null without one (older services). */
  const dataShortfall = () => {
    const amount = wxhoprShortfall();
    return amount === null
      ? null
      : dataToSend(amount, appState.pixPricePerByte);
  };

  return {
    preparingSafe,
    standIn,
    balanceShown,
    runModeStatus,
    nodeAddress,
    wxhoprStatus,
    wxhoprShortfall,
    dataShortfall,
  };
}
