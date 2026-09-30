import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { logWarn } from "@src/utils/appLog.ts";

// Optimistic start: headless runs (screenshot shim, tests) never get a real focus event.
const [focused, setFocused] = createSignal(true);
globalThis.addEventListener("focus", () => setFocused(true));
globalThis.addEventListener("blur", () => setFocused(false));

const [pointerInside, setPointerInside] = createSignal(true);
globalThis.addEventListener("mousemove", () => {
  if (!pointerInside()) setPointerInside(true);
});

// Linux-only in practice: the backend emits nothing on macOS/Windows, where the DOM leave works.
listen("pointer-left-window", () => setPointerInside(false))
  .catch((e) =>
    logWarn(`[tooltip] pointer-left-window listener setup failed: ${e}`)
  );

/** False when a hover cannot be real: the window is blurred, or the pointer has left it. */
export const hoverIsPlausible = () => focused() && pointerInside();
