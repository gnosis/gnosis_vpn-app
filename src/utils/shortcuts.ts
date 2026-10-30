/** What a main-screen key press asks for. */
export type MainShortcut = "primary" | "picker" | "settings" | "cancel";

export interface ShortcutKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface ShortcutContext {
  /** Cmd is the modifier on macOS, Ctrl elsewhere. */
  isMac: boolean;
  /** A text field, button or other control has focus: Enter belongs to it. */
  controlFocused: boolean;
  /** The location picker is open: it owns Enter and Esc. */
  pickerOpen: boolean;
  /** A connect is in flight, so Esc means cancel. */
  connecting: boolean;
}

/**
 * Resolves the main screen's shortcuts, none of which are shown in the UI:
 * Enter connects or disconnects, Cmd/Ctrl+L opens the picker, Cmd/Ctrl+,
 * opens settings, Esc cancels a connect. Null means the key is not ours.
 */
export function resolveMainShortcut(
  e: ShortcutKey,
  ctx: ShortcutContext,
): MainShortcut | null {
  const modifier = ctx.isMac ? e.metaKey : e.ctrlKey;
  const otherModifier = ctx.isMac ? e.ctrlKey : e.metaKey;
  if (e.altKey || otherModifier) return null;
  if (modifier) {
    if (e.shiftKey) return null;
    if (e.key.toLowerCase() === "l") return "picker";
    if (e.key === ",") return "settings";
    return null;
  }
  if (e.shiftKey) return null;
  if (ctx.pickerOpen) return null;
  if (e.key === "Enter" && !ctx.controlFocused) return "primary";
  if (e.key === "Escape" && ctx.connecting) return "cancel";
  return null;
}

const CONTROL_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);

/** Whether `el` is a control that handles Enter itself. */
export function isControl(el: Element | null): boolean {
  if (!el) return false;
  if (CONTROL_TAGS.has(el.tagName)) return true;
  if (el.getAttribute("role") === "button") return true;
  return (el as HTMLElement).isContentEditable === true;
}
