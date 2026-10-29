import { createSignal } from "solid-js";
import { logInfo, logWarn } from "@src/utils/appLog.ts";

/** Pages that replace the main screen's content; none means the main content. */
export const PAGE_IDS = [
  "settings",
  "software-update",
  "about",
  "add-funds",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/** What the host (tray) may ask for: a page, or the wallet popover. */
export type HostTarget = PageId | "wallet";

export function isPageId(id: string): id is PageId {
  return (PAGE_IDS as readonly string[]).includes(id);
}

export function isHostTarget(id: string): id is HostTarget {
  return id === "wallet" || isPageId(id);
}

/** Pure stack rules, exported for tests; the module-level store below applies them. */
export function pushPage(stack: readonly PageId[], id: PageId): PageId[] {
  // A page already on top is not pushed twice (two tray clicks, two Cmd+,).
  if (stack[stack.length - 1] === id) return [...stack];
  return [...stack, id];
}

export function popPage(stack: readonly PageId[]): PageId[] {
  return stack.slice(0, -1);
}

// Module scope: App.tsx, MainScreen, Navigation and the shortcuts share one stack.
const [stack, setStack] = createSignal<PageId[]>([]);
// One host request kept while the app is not on the main screen.
const [pending, setPending] = createSignal<HostTarget | null>(null);
// A request to open the wallet popover, held until Navigation consumes it.
const [walletRequested_, setWalletRequested] = createSignal(false);

/** The page on top, or null for the main content. */
export const currentPage = (): PageId | null => {
  const s = stack();
  return s.length === 0 ? null : s[s.length - 1];
};

export const pageDepth = (): number => stack().length;

export function push(id: PageId): void {
  setStack((s) => pushPage(s, id));
}

/** Goes back one page; false when already on the main content. */
export function back(): boolean {
  if (stack().length === 0) return false;
  setStack(popPage);
  return true;
}

/** Leaves every page; the main content shows again. */
export function reset(): void {
  setStack([]);
}

/** True until Navigation has opened the popover for it. */
export const walletRequested = walletRequested_;

export function requestWallet(): void {
  setWalletRequested(true);
}

/** Navigation calls this once it has opened the popover. */
export function consumeWalletRequest(): void {
  setWalletRequested(false);
}

/**
 * A request from outside the webview (tray menu, Rust). Applied at once on
 * the main screen; otherwise kept until the main screen shows, one at a time.
 */
export function navigateFromHost(id: string, onMainScreen: boolean): void {
  if (!isHostTarget(id)) {
    logWarn(`Ignoring navigate event with unknown target: ${id}`);
    return;
  }
  if (!onMainScreen) {
    logInfo(`Keeping navigation to ${id} until the main screen shows`);
    setPending(id);
    return;
  }
  applyHostTarget(id);
}

function applyHostTarget(id: HostTarget): void {
  if (id === "wallet") {
    reset();
    requestWallet();
    return;
  }
  // The tray's targets are top-level pages: a page stack from an earlier visit is replaced.
  if (id === "software-update" || id === "about") {
    setStack(["settings", id]);
  } else {
    setStack([id]);
  }
}

/** Called when the app screen changes: pages never outlive the main screen, and a kept request lands. */
export function onScreenChange(onMainScreen: boolean): void {
  if (!onMainScreen) {
    reset();
    return;
  }
  const kept = pending();
  if (kept !== null) {
    setPending(null);
    logInfo(`Applying kept navigation to ${kept}`);
    applyHostTarget(kept);
  }
}

/** Test seam: the module state, so each test starts clean. */
export function resetPageStackForTests(): void {
  setStack([]);
  setPending(null);
  setWalletRequested(false);
}
