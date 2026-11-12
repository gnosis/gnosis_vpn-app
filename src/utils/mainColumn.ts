import { settingsTab } from "@src/utils/settingsPage.ts";

export const MAIN_COLUMN_ID = "main-column";

/** Portal target for main-screen overlays, so they cover the main column and not the traffic pane beside it. */
export function overlayMount(): HTMLElement {
  // settings cover the whole window and leave the main column inert under them
  if (settingsTab()) return document.body;
  return document.getElementById(MAIN_COLUMN_ID) ?? document.body;
}
