import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  type UpdateManifest,
  useSettingsStore,
} from "@src/stores/settingsStore.ts";

export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Shared between the scheduler (App.tsx) and the manual "connect and check" flow (Updates.tsx).
export const [pendingCheckAfterConnect, setPendingCheckAfterConnect] =
  createSignal(false);

const [, settingsActions] = useSettingsStore();

export async function runBackgroundCheck(): Promise<void> {
  try {
    const manifest = await invoke<UpdateManifest>("check_update", {
      skipVpn: false,
    });
    await settingsActions.setUpdateCheckResult(manifest, Date.now());
  } catch (e) {
    if (e === "VpnNotConnected") {
      setPendingCheckAfterConnect(true);
    }
  }
}
