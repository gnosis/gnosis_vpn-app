import { useAppStore } from "../../stores/appStore.ts";
import { headerStatus, type HeaderTone } from "../../utils/status.ts";

const dotClass: Record<HeaderTone, string> = {
  idle: "bg-text-muted",
  connecting: "bg-text-yellow status-dot-blink",
  connected: "bg-vpn-light-green",
  stalled: "bg-text-yellow",
  restarting: "bg-text-yellow",
  unavailable: "bg-vpn-red",
};

const textClass: Record<HeaderTone, string> = {
  idle: "text-text-secondary",
  connecting: "text-text-yellow",
  connected: "text-text-green",
  stalled: "text-text-yellow",
  restarting: "text-text-yellow",
  unavailable: "text-text-red",
};

/** The main screen's one text status: a dot and a few words, no pill. */
export default function StatusHeader() {
  const [appState] = useAppStore();
  const status = () => headerStatus(appState);

  return (
    // h-10 matches the navigation icon buttons on the same row.
    <div
      class="flex h-10 items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <span
        class={`size-2 shrink-0 rounded-full transition-colors duration-300 ${
          dotClass[status().tone]
        }`}
        aria-hidden="true"
      />
      <span
        class={`text-sm font-bold transition-colors duration-300 ${
          textClass[status().tone]
        }`}
      >
        {status().text}
      </span>
    </div>
  );
}
