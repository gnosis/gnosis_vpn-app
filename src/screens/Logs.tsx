import { For, Show } from "solid-js";
import { useLogsStore } from "@src/stores/logsStore";

export default function Logs() {
  const [logsState] = useLogsStore();

  return (
    <Show when={logsState.logs.length > 0} fallback={<div>No logs</div>}>
      <div class="space-y-2 p-4">
        <div class="overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs font-mono">
          <For each={logsState.logs}>
            {(entry) => (
              <div class="whitespace-pre-wrap">
                <span class="font-semibold">
                  [{new Date(entry.date).toLocaleString()}]
                </span>{" "}
                {entry.message}
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
