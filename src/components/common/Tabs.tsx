import { For } from "solid-js";

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
  console.log("props", props);
  return (
    <div class={props.class ?? ""}>
      <div class="border-b border-gray-200 px-4">
        <div class="flex gap-2">
          <For each={props.tabs}>
            {(t) => {
              return (
                <button
                  type="button"
                  class={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    t.id === props.activeId
                      ? "bg-gray-200 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                  onClick={() => props.onChange(t.id)}
                >
                  {t.label}
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
