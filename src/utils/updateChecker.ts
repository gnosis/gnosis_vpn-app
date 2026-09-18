import { createSignal } from "solid-js";
import { logInfo } from "@src/utils/appLog.ts";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { checkUpdate } from "@src/services/toolkit.ts";

export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Main-window-only: drives the auto-update scheduler in App.tsx.
// Module-level Solid signals don't cross Tauri webviews — the settings
// window's "Connect and check" flow uses its own local signal in Updates.tsx.
export const [pendingCheckAfterConnect, setPendingCheckAfterConnect] =
  createSignal(false);

const [, settingsActions] = useSettingsStore();

export async function runBackgroundCheck(): Promise<void> {
  try {
    const result = await checkUpdate(false);
    // A result without a manifest never reaches here (the Rust side rejects
    // those), but the type allows it and the stored one must survive if it did.
    if (result.manifest) {
      await settingsActions.setUpdateCheckResult(result.manifest, Date.now());
    }
  } catch (e) {
    // other failures are logged by the backend's check_update command
    if (e === "VpnNotConnected") {
      logInfo("Update check deferred until VPN connects");
      setPendingCheckAfterConnect(true);
    }
  }
}
