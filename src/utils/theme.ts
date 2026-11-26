import type { ThemePreference } from "@src/stores/settingsStore.ts";

export type Theme = "light" | "dark";

/** The theme to render: the user's pin, or the OS theme on "auto". */
export function resolveTheme(preference: ThemePreference, os: Theme): Theme {
  return preference === "auto" ? os : preference;
}

/** Narrows an OS report to a theme; anything but "light" counts as dark, as in Rust. */
export function toTheme(value: string): Theme {
  return value === "light" ? "light" : "dark";
}
