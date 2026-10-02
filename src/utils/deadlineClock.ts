import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";

// Longer delays overflow setTimeout and fire at once, so long waits are chained.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** `Date.now()` as a signal that refreshes once `deadline` (epoch ms) has passed. */
export function createDeadlineClock(
  deadline: Accessor<number>,
): Accessor<number> {
  const [now, setNow] = createSignal(Date.now());
  createEffect(() => {
    const at = deadline();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = () => {
      const remaining = at - Date.now();
      if (remaining <= 0) {
        setNow(Date.now());
        return;
      }
      timer = setTimeout(wait, Math.min(remaining, MAX_TIMEOUT_MS));
    };
    setNow(Date.now());
    wait();
    onCleanup(() => clearTimeout(timer));
  });
  return now;
}
