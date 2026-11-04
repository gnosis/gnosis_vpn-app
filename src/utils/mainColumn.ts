export const MAIN_COLUMN_ID = "main-column";

/** Portal target for main-screen overlays, so they cover the main column and not the traffic pane beside it. */
export function overlayMount(): HTMLElement {
  return document.getElementById(MAIN_COLUMN_ID) ?? document.body;
}
