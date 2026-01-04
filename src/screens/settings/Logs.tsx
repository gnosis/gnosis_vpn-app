import { For, Show } from "solid-js";
import { useLogsStore } from "@src/stores/logsStore";
import ExportLogs from "@src/components/ExportLogs";

export default function Logs() {
  const [logsState] = useLogsStore();

  return (
    <div class="w-full p-2 flex flex-col flex-1 min-h-0">
      <div class="w-full flex-1 min-h-0 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs font-mono">
        <Show when={logsState.logs.length > 0} fallback={<div>No logs</div>}>
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
        </Show>
      </div>
      <ExportLogs />
    </div>
  );
}
