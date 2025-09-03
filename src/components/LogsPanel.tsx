import { For } from 'solid-js';
import { useAppStore } from '../stores/appStore';

export default function LogsPanel() {
  const [appState] = useAppStore();

  const items = () =>
    appState.logs ?? [
      {
        date: new Date().toISOString(),
        message: 'Initializing VPN service...',
      },
    ];

  return (
    <div class="space-y-2">
      <div class="overflow-auto rounded border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-2 text-xs font-mono">
        <For each={items()}>
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
  );
}
