import { createSignal } from "solid-js";

// Optimistic start: headless runs (screenshot shim, tests) never get a real focus event.
const [focused, setFocused] = createSignal(true);
globalThis.addEventListener("focus", () => setFocused(true));
globalThis.addEventListener("blur", () => setFocused(false));

export const isWindowFocused = focused;
