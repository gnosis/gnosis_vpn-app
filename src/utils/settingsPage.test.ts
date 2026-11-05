import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@src/utils/appLog.ts", () => ({ logInfo: vi.fn() }));

import {
  clearSettingsRequest,
  closeSettings,
  isSettingsTarget,
  openSettings,
  settingsRequest,
  settingsTab,
  showSettingsTab,
} from "./settingsPage.ts";

describe("settingsPage", () => {
  beforeEach(() => closeSettings());

  it("opens a plain tab without a request", () => {
    openSettings("usage");
    expect(settingsTab()).toBe("usage");
    expect(settingsRequest()).toBeNull();
  });

  it("opens the tab a request belongs to", () => {
    openSettings("add-funds");
    expect(settingsTab()).toBe("usage");
    expect(settingsRequest()).toBe("add-funds");

    openSettings("update");
    expect(settingsTab()).toBe("general");
    expect(settingsRequest()).toBe("update");

    openSettings("check-update");
    expect(settingsTab()).toBe("general");
    expect(settingsRequest()).toBe("check-update");
  });

  it("drops a stale request when opened plainly", () => {
    openSettings("check-update");
    openSettings("general");
    expect(settingsRequest()).toBeNull();
  });

  it("keeps the request across a tab switch until it is cleared", () => {
    openSettings("add-funds");
    showSettingsTab("general");
    expect(settingsRequest()).toBe("add-funds");
    clearSettingsRequest();
    expect(settingsRequest()).toBeNull();
    expect(settingsTab()).toBe("general");
  });

  it("closing clears the tab and the request", () => {
    openSettings("add-funds");
    closeSettings();
    expect(settingsTab()).toBeNull();
    expect(settingsRequest()).toBeNull();
  });

  it("accepts only known targets from the tray", () => {
    expect(isSettingsTarget("check-update")).toBe(true);
    expect(isSettingsTarget("update")).toBe(true);
    expect(isSettingsTarget("settings")).toBe(false);
    expect(isSettingsTarget("toString")).toBe(false);
    expect(isSettingsTarget(undefined)).toBe(false);
  });
});
