import { createSignal } from "solid-js";
import { logInfo } from "@src/utils/appLog.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { checkUpdate } from "@src/services/toolkit.ts";

export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Drives the auto-update scheduler in App.tsx; the Update page's "Connect and check" keeps its own in useUpdates.ts.
export const [pendingCheckAfterConnect, setPendingCheckAfterConnect] =
  createSignal(false);

const [, settingsActions] = useSettingsStore();

export async function runBackgroundCheck(): Promise<void> {
  try {
    const result = await checkUpdate(false);
    await settingsActions.setUpdateCheckResult(
      result.outcome,
      result.end_of_life,
      Date.now(),
    );
  } catch (e) {
    // other failures are logged by the backend's check_update command
    if (e === "VpnNotConnected") {
      logInfo("Update check deferred until VPN connects");
      setPendingCheckAfterConnect(true);
    }
  }
}
