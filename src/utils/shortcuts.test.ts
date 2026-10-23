import { describe, expect, it } from "vitest";
import {
  resolveMainShortcut,
  type ShortcutContext,
  type ShortcutKey,
} from "./shortcuts.ts";

const press = (key: string, mods: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

const CTX: ShortcutContext = {
  isMac: false,
  controlFocused: false,
  pickerOpen: false,
  connecting: false,
};

describe("resolveMainShortcut", () => {
  it("Enter is the primary action when nothing that handles Enter has focus", () => {
    expect(resolveMainShortcut(press("Enter"), CTX)).toBe("primary");
    expect(
      resolveMainShortcut(press("Enter"), { ...CTX, controlFocused: true }),
    )
      .toBe(null);
  });

  it("uses Ctrl on Linux and Cmd on macOS for L and comma", () => {
    expect(resolveMainShortcut(press("l", { ctrlKey: true }), CTX)).toBe(
      "picker",
    );
    expect(resolveMainShortcut(press("L", { ctrlKey: true }), CTX)).toBe(
      "picker",
    );
    expect(resolveMainShortcut(press(",", { ctrlKey: true }), CTX)).toBe(
      "settings",
    );
    const mac = { ...CTX, isMac: true };
    expect(resolveMainShortcut(press("l", { metaKey: true }), mac)).toBe(
      "picker",
    );
    expect(resolveMainShortcut(press(",", { metaKey: true }), mac)).toBe(
      "settings",
    );
    // the other platform's modifier is not ours
    expect(resolveMainShortcut(press("l", { metaKey: true }), CTX)).toBe(null);
    expect(resolveMainShortcut(press("l", { ctrlKey: true }), mac)).toBe(null);
  });

  it("ignores chords with Alt or Shift", () => {
    expect(
      resolveMainShortcut(press("l", { ctrlKey: true, altKey: true }), CTX),
    ).toBe(null);
    expect(
      resolveMainShortcut(press("L", { ctrlKey: true, shiftKey: true }), CTX),
    ).toBe(null);
    expect(resolveMainShortcut(press("Enter", { shiftKey: true }), CTX)).toBe(
      null,
    );
  });

  it("Escape cancels only while connecting", () => {
    expect(resolveMainShortcut(press("Escape"), CTX)).toBe(null);
    expect(resolveMainShortcut(press("Escape"), { ...CTX, connecting: true }))
      .toBe("cancel");
  });

  it("leaves Enter and Escape to an open picker but still toggles it with the chord", () => {
    const open = { ...CTX, pickerOpen: true, connecting: true };
    expect(resolveMainShortcut(press("Enter"), open)).toBe(null);
    expect(resolveMainShortcut(press("Escape"), open)).toBe(null);
    expect(resolveMainShortcut(press("l", { ctrlKey: true }), open)).toBe(
      "picker",
    );
  });

  it("is not interested in other keys", () => {
    expect(resolveMainShortcut(press("a"), CTX)).toBe(null);
    expect(resolveMainShortcut(press("a", { ctrlKey: true }), CTX)).toBe(null);
  });
});
