// A ring that depletes clockwise from full to empty over the countdown's
// remaining time — like a normal countdown timer running out. Pure CSS
// timing (no setInterval): the component is mounted for the countdown's
// duration by its caller's <Show>, so animation-duration alone keeps it in
// sync.
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function SwitchSpinner(props: { endsAt: number }) {
  // The countdown this mirrors can start before the banner is even on
  // screen (e.g. while an earlier screen is still throttled open by
  // MIN_SCREEN_DISPLAY_TIME) — basing the duration on the actual time left
  // at mount, rather than assuming a fresh SWITCH_COUNTDOWN_MS window, keeps
  // the recede in sync with the real commit instead of finishing early.
  const remainingMs = Math.max(0, props.endsAt - Date.now());

  return (
    <svg
      viewBox="0 0 24 24"
      class="h-full w-full -rotate-90 text-text-secondary"
      role="img"
      aria-label="Switching"
    >
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-dasharray={`${CIRCUMFERENCE}`}
        class="countdown-recede"
        style={{
          "--countdown-circumference": `${CIRCUMFERENCE}`,
          "animation-duration": `${remainingMs}ms`,
        }}
      />
    </svg>
  );
}
