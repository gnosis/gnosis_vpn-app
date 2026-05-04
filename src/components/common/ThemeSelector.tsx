import { For } from "solid-js";

type Theme = "auto" | "light" | "dark";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface ThemeSelectorProps {
  value: Theme;
  onChange: (theme: Theme) => void;
}

export default function ThemeSelector(props: ThemeSelectorProps) {
  return (
    <div class="flex items-center justify-between">
      <span class="text-text-primary">Theme</span>
      <div class="flex gap-0.5 bg-bg-surface border border-border rounded-lg p-0.5">
        <For each={OPTIONS}>
          {(opt) => (
            <button
              type="button"
              class={`px-3 py-1 text-sm rounded-md transition-colors hover:cursor-pointer ${
                props.value === opt.value
                  ? "bg-accent text-accent-text"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              onClick={() => props.onChange(opt.value)}
            >
              {opt.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
