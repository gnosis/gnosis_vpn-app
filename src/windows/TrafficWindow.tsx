import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import TrafficPane from "@src/components/traffic/TrafficPane.tsx";
import { logError } from "@src/utils/appLog.ts";

/** The window lives hidden from startup; the pane mounts per opening, so each one starts a fresh capture. */
export default function TrafficWindow() {
  const [open, setOpen] = createSignal(false);
  let unlisten: (() => void)[] = [];
  let disposed = false;

  onMount(() => {
    void (async () => {
      const current = getCurrentWebviewWindow();
      const listeners = await Promise.all([
        current.listen("traffic:open", () => setOpen(true)),
        current.listen("traffic:closed", () => setOpen(false)),
      ]);
      if (disposed) {
        listeners.forEach((stop) => stop());
        return;
      }
      unlisten = listeners;
      // Shown before the listeners existed.
      if (await current.isVisible()) setOpen(true);
    })().catch((e) => logError(`Cannot follow the traffic window: ${e}`));
  });

  onCleanup(() => {
    disposed = true;
    unlisten.forEach((stop) => stop());
  });

  return (
    <div class="h-screen bg-bg-primary">
      <Show when={open()}>
        <TrafficPane />
      </Show>
    </div>
  );
}
