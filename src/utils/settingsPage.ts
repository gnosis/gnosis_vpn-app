import { createSignal } from "solid-js";
import { logInfo } from "@src/utils/appLog.ts";

export type SettingsTab = "general" | "usage";
/** Something to do once its tab shows: open Add funds, open the Update page, or open it and run a check. */
export type SettingsRequest = "add-funds" | "update" | "check-update";
export type SettingsTarget = SettingsTab | SettingsRequest;

const TARGET_TAB: Record<SettingsTarget, SettingsTab> = {
  general: "general",
  usage: "usage",
  "add-funds": "usage",
  update: "general",
  "check-update": "general",
};

// equals: false, so reopening the shown tab still notifies and closes a subpage over it
const [settingsTab, setSettingsTab] = createSignal<SettingsTab | null>(null, {
  equals: false,
});
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
    target === "general" || target === "usage" ? null : target,
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
