import { createSignal } from "solid-js";
import { logInfo } from "@src/utils/appLog.ts";

export type SettingsTab = "general" | "usage";
/** Something to do once its tab shows: open Add funds, or run an update check. */
export type SettingsRequest = "add-funds" | "check-update";
export type SettingsTarget = SettingsTab | SettingsRequest;

const TARGET_TAB: Record<SettingsTarget, SettingsTab> = {
  general: "general",
  usage: "usage",
  "add-funds": "usage",
  "check-update": "general",
};

const [settingsTab, setSettingsTab] = createSignal<SettingsTab | null>(null);
const [settingsRequest, setSettingsRequest] = createSignal<
  SettingsRequest | null
>(null);

/** The open tab of the main window's Settings page; null while it is closed. */
export { settingsTab };
/** The pending request, until its tab takes it with `clearSettingsRequest`. */
export { settingsRequest };

export function isSettingsTarget(value: unknown): value is SettingsTarget {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TARGET_TAB, value);
}

export function openSettings(target: SettingsTarget): void {
  logInfo(`Opening settings (${target})`);
  setSettingsTab(TARGET_TAB[target]);
  setSettingsRequest(
    target === "add-funds" || target === "check-update" ? target : null,
  );
}

export function showSettingsTab(tab: SettingsTab): void {
  setSettingsTab(tab);
}

export function closeSettings(): void {
  setSettingsTab(null);
  setSettingsRequest(null);
}

export function clearSettingsRequest(): void {
  setSettingsRequest(null);
}
