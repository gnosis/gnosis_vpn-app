import { beforeEach, describe, expect, it } from "vitest";
import {
  back,
  consumeWalletRequest,
  currentPage,
  isHostTarget,
  isPageId,
  navigateFromHost,
  onScreenChange,
  popPage,
  push,
  pushPage,
  resetPageStackForTests,
  walletRequested,
} from "./pageStack.ts";

describe("pushPage / popPage", () => {
  it("pushes and pops in order", () => {
    const a = pushPage([], "settings");
    const b = pushPage(a, "about");
    expect(b).toEqual(["settings", "about"]);
    expect(popPage(b)).toEqual(["settings"]);
    expect(popPage([])).toEqual([]);
  });

  it("does not push the page already on top twice", () => {
    expect(pushPage(["settings"], "settings")).toEqual(["settings"]);
  });
});

describe("page stack store", () => {
  beforeEach(() => resetPageStackForTests());

  it("starts on the main content and goes back to it", () => {
    expect(currentPage()).toBe(null);
    push("settings");
    push("software-update");
    expect(currentPage()).toBe("software-update");
    expect(back()).toBe(true);
    expect(currentPage()).toBe("settings");
    expect(back()).toBe(true);
    expect(currentPage()).toBe(null);
    expect(back()).toBe(false);
  });

  it("applies a host request at once on the main screen", () => {
    navigateFromHost("settings", true);
    expect(currentPage()).toBe("settings");
    // sub-pages come with their parent underneath, so back lands on Settings
    navigateFromHost("software-update", true);
    expect(currentPage()).toBe("software-update");
    back();
    expect(currentPage()).toBe("settings");
  });

  it("keeps one host request until the main screen shows", () => {
    navigateFromHost("about", false);
    navigateFromHost("add-funds", false);
    expect(currentPage()).toBe(null);
    onScreenChange(true);
    expect(currentPage()).toBe("add-funds");
    // consumed: a later return to the main screen applies nothing
    back();
    onScreenChange(true);
    expect(currentPage()).toBe(null);
  });

  it("drops unknown targets", () => {
    navigateFromHost("usage", true);
    expect(currentPage()).toBe(null);
    expect(isPageId("usage")).toBe(false);
    expect(isHostTarget("wallet")).toBe(true);
  });

  it("leaves every page when the app leaves the main screen", () => {
    push("settings");
    onScreenChange(false);
    expect(currentPage()).toBe(null);
  });

  it("turns a wallet request into a popover request and no page", () => {
    push("settings");
    navigateFromHost("wallet", true);
    expect(currentPage()).toBe(null);
    expect(walletRequested()).toBe(true);
    consumeWalletRequest();
    expect(walletRequested()).toBe(false);
  });

  it("holds a wallet request from another screen until the main screen shows", () => {
    navigateFromHost("wallet", false);
    expect(walletRequested()).toBe(false);
    onScreenChange(true);
    expect(walletRequested()).toBe(true);
  });
});
