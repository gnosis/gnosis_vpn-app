import { For, Show } from 'solid-js';
import { useAppStore } from '../stores/appStore';

export default function LogsPanel() {
  const [appState] = useAppStore();

  return (
    <Show when={appState.logs.length > 0} fallback={<div>No logs</div>}>
      <div class="space-y-2">
        <div class="overflow-auto rounded border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-2 text-xs font-mono">
          <For each={appState.logs}>
            {entry => (
              <div class="whitespace-pre-wrap">
                <span class="font-semibold">
                  [{new Date(entry.date).toLocaleString()}]
                </span>{' '}
                {entry.message}
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
