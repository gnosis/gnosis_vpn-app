import { createMemo } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  isPreparingSafeRunMode,
  isRunningRunMode,
  warmupProgress,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
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

  return { preparingSafe, standIn, balanceShown, runModeStatus, nodeAddress };
}
