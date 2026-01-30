import { For } from "solid-js";
import TabLabel from "./TabLabel.tsx";

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: readonly TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  class?: string;
}

export default function Tabs(props: TabsProps) {
  return (
    <div class="w-full border-b border-border flex items-center justify-center gap-2 p-2 bg-bg-primary">
      <For each={props.tabs}>
        {(t) => {
          return (
            <button
              type="button"
              class={`px-3 py-1.5 rounded-lg text-sm transition-colors hover:cursor-pointer ${
                t.id === props.activeId
                  ? "bg-bg-surface text-text-primary"
                  : "text-text-secondary hover:bg-bg-surface"
              }`}
              onClick={() => props.onChange(t.id)}
            >
              <TabLabel label={t.label} />
            </button>
          );
        }}
      </For>
    </div>
  );
}
