import { createSignal, onCleanup } from "solid-js";

const QUERY = "(prefers-reduced-motion: reduce)";

/// Whether the user asked for less motion, as a reactive signal.
///
/// `index.css` already honours this for CSS animations, class by class. JS-driven motion —
/// the map's view transition and its travelling dots — cannot be reached that way, so it has
/// to ask directly.
export function createReducedMotion(): () => boolean {
  // Guard the whole thing: matchMedia is missing in a non-DOM test environment, and vitest
  // runs these utils under `environment: "node"`.
  if (typeof globalThis.matchMedia !== "function") return () => false;

  const query = globalThis.matchMedia(QUERY);
  const [reduced, setReduced] = createSignal(query.matches);
  const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
  query.addEventListener("change", onChange);
  onCleanup(() => query.removeEventListener("change", onChange));
  return reduced;
}
