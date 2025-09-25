import { For, Show } from "solid-js";
import { useLogsStore } from "../stores/logsStore.ts";
import { SecondaryScreen } from "../components/common/SecondaryScreen.tsx";

export default function Logs() {
  const [logsState] = useLogsStore();

  return (
    <SecondaryScreen>
      <Show when={logsState.logs.length > 0} fallback={<div>No logs</div>}>
        <div class="space-y-2 p-4">
          <div class="overflow-auto rounded border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-2 text-xs font-mono">
            <For each={logsState.logs}>
              {entry => (
                <div class="whitespace-pre-wrap">
                  <span class="font-semibold">[{new Date(entry.date).toLocaleString()}]</span> {entry.message}
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </SecondaryScreen>
  );
}
