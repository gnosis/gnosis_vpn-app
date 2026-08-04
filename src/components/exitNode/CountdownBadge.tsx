import { createMemo, createSignal, onCleanup, Show } from "solid-js";

// Ticks its own display clock; the actual switch is driven by bannerStore's
// setTimeout, this just renders the countdown down to it.
export default function CountdownBadge(props: { countdownEndsAt: number }) {
  const [now, setNow] = createSignal(Date.now());
  const tick = setInterval(() => setNow(Date.now()), 250);
  onCleanup(() => clearInterval(tick));

  const secondsLeft = createMemo(() =>
    Math.max(0, Math.ceil((props.countdownEndsAt - now()) / 1000))
  );

  return (
    <Show when={secondsLeft() > 0}>
      <span class="card-pop-in absolute top-1.5 right-3 rounded-full bg-bg-primary px-2 py-0.5 text-xs font-semibold text-text-primary shadow-md">
        Switching in {secondsLeft()}s
      </span>
    </Show>
  );
}
