// Same 12-dash layout as assets/icons/loading.svg, but instead of spinning
// forever, each dash switches off in turn — a receding countdown that ends
// fully empty exactly when the switch happens. Pure CSS timing (no
// setInterval): the component is mounted for the countdown's duration by its
// caller's <Show>, so animation-delay alone keeps it in sync.
const DASHES = [
  { x1: 1200, y1: 600, x2: 1200, y2: 100 },
  { x1: 1200, y1: 2300, x2: 1200, y2: 1800 },
  { x1: 900, y1: 680.4, x2: 650, y2: 247.4 },
  { x1: 1750, y1: 2152.6, x2: 1500, y2: 1719.6 },
  { x1: 680.4, y1: 900, x2: 247.4, y2: 650 },
  { x1: 2152.6, y1: 1750, x2: 1719.6, y2: 1500 },
  { x1: 600, y1: 1200, x2: 100, y2: 1200 },
  { x1: 2300, y1: 1200, x2: 1800, y2: 1200 },
  { x1: 680.4, y1: 1500, x2: 247.4, y2: 1750 },
  { x1: 2152.6, y1: 650, x2: 1719.6, y2: 900 },
  { x1: 900, y1: 1719.6, x2: 650, y2: 2152.6 },
  { x1: 1750, y1: 247.4, x2: 1500, y2: 680.4 },
];

export default function SwitchSpinner(props: { endsAt: number }) {
  // The countdown this mirrors can start before the banner is even on
  // screen (e.g. while an earlier screen is still throttled open by
  // MIN_SCREEN_DISPLAY_TIME) — basing delays on the actual time left at
  // mount, rather than assuming a fresh SWITCH_COUNTDOWN_MS window, keeps
  // the recede in sync with the real commit instead of finishing early.
  const remainingMs = Math.max(0, props.endsAt - Date.now());

  return (
    <svg
      viewBox="0 0 2400 2400"
      class="h-5 w-5 shrink-0 text-text-secondary"
      role="img"
      aria-label="Switching"
    >
      <g stroke-width="200" stroke-linecap="round" stroke="currentColor">
        {DASHES.map((d, i) => (
          <line
            x1={d.x1}
            y1={d.y1}
            x2={d.x2}
            y2={d.y2}
            class="dash-recede"
            style={{
              "animation-delay": `${((i + 1) / DASHES.length) * remainingMs}ms`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
