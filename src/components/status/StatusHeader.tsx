import { useAppStore } from "../../stores/appStore.ts";
import { headerStatus, type HeaderTone } from "../../utils/status.ts";

// The dot paints in the text colour (bg-current), so the two can never drift apart.
const toneClass: Record<HeaderTone, string> = {
  idle: "text-text-secondary",
  connecting: "text-text-yellow",
  connected: "text-text-green",
  stalled: "text-text-yellow",
  restarting: "text-text-yellow",
  inUse: "text-text-yellow",
  unavailable: "text-text-red",
};

/** The main screen's one text status: a dot and a few words, no pill. */
export default function StatusHeader() {
  const [appState] = useAppStore();
  const status = () => headerStatus(appState);

  return (
    // h-10 matches the navigation icon buttons on the same row.
    <div
      class={`flex h-10 items-center gap-2 transition-colors duration-300 ${
        toneClass[status().tone]
      }`}
      role="status"
      aria-live="polite"
    >
      {/* -translate-y-px: line-box centering sits 1px below the bold text's optical center */}
      <span
        class={`size-2 shrink-0 -translate-y-px rounded-full bg-current ${
          status().tone === "connecting" ? "status-dot-blink" : ""
        }`}
        aria-hidden="true"
      />
      <span class="text-sm font-bold">{status().text}</span>
    </div>
  );
}
