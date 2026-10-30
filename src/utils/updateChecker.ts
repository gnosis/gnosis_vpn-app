import { createSignal } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { checkUpdate } from "@src/services/toolkit.ts";

export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Main-window-only: drives the auto-update scheduler in App.tsx.
// Module-level Solid signals don't cross Tauri webviews — the settings
// window's "Connect and check" flow uses its own local signal in Updates.tsx.
export const [pendingCheckAfterConnect, setPendingCheckAfterConnect] =
  createSignal(false);

const [, settingsActions] = useSettingsStore();

/** True while any update check runs, so the Settings row can say "Checking…". */
export const [updateChecking, setUpdateChecking] = createSignal(false);

export async function runBackgroundCheck(): Promise<void> {
  setUpdateChecking(true);
  try {
    // Callers run this only once the app sees Connected; the update tool's own probe can misread that.
    const result = await checkUpdate(true);
    await settingsActions.setUpdateCheckResult(
      result.outcome,
      result.end_of_life,
      Date.now(),
    );
  } catch {
    // failures are logged by the backend's check_update command
  } finally {
    setUpdateChecking(false);
  }
}
