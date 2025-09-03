import { For } from 'solid-js';

interface LogsPanelProps {
  logs?: string[];
}

export default function LogsPanel(props: LogsPanelProps) {
  const items = () =>
    props.logs ?? [
      'Initializing VPN service...',
      'Checking connectivity...',
      'Ready.',
    ];

  return (
    <div class="space-y-2">
      <div class="max-h-64 overflow-auto rounded border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-2 text-xs font-mono">
        <For each={items()}>
          {line => <div class="whitespace-pre-wrap">{line}</div>}
        </For>
      </div>
    </div>
  );
}
