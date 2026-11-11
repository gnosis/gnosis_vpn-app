import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { logError, logInfo } from "@src/utils/appLog.ts";

/** The window moves under a resting pointer while it resizes; hovers that soon after are not the user's. */
const HOVER_BLOCK_MS = 900;
/** The pane's fade-out in App.tsx; the window shrinks only after it, so the pane never gets cut off mid-fade. */
export const PANE_FADE_OUT_MS = 250;

// Main-window-only, like updateChecker.ts: module signals don't cross webviews.
const [open, setOpen] = createSignal(false);
// Outlives `open` by the fade-out, so the pane fades instead of vanishing.
const [mounted, setMounted] = createSignal(false);
let hoverBlockedUntil = 0;
let latestRequest = 0;

export const trafficPaneOpen = open;
export const trafficPaneMounted = mounted;

export function balanceHoverBlocked(): boolean {
  return performance.now() < hoverBlockedUntil;
}

/** Widens the main window to the left for the pane, or shrinks it back. */
export async function setTrafficPane(next: boolean): Promise<void> {
  if (next === open()) return;
  const request = ++latestRequest;
  hoverBlockedUntil = performance.now() + HOVER_BLOCK_MS;
  setOpen(next);
  logInfo(`traffic pane ${next ? "opening" : "closing"}`);
  if (next) {
    setMounted(true);
    try {
      await invoke("traffic_pane", { open: true });
    } catch (e) {
      logError(`Failed to widen the window for the traffic pane: ${e}`);
      if (request === latestRequest) {
        setOpen(false);
        setMounted(false);
      }
    }
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, PANE_FADE_OUT_MS));
  // Reopened during the fade: the window is still wide, so leave it.
  if (request !== latestRequest) return;
  try {
    await invoke("traffic_pane", { open: false });
  } catch (e) {
    logError(`Failed to shrink the window after the traffic pane: ${e}`);
  }
  if (request === latestRequest) setMounted(false);
}

export function toggleTrafficPane(): Promise<void> {
  return setTrafficPane(!open());
}

/** The backend already shrank the window, on its way to the tray. */
export function trafficPaneCollapsed(): void {
  latestRequest++;
  setOpen(false);
  setMounted(false);
}
