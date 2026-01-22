import type { JSX } from "solid-js";

export default function Toggle(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & { label?: string },
) {
  const { class: className, ...rest } = props;

  return (
    <label class="flex items-center justify-between">
      <span class="text-text-primary">{props.label}</span>
      <input
        {...rest}
        type="checkbox"
        role="switch"
        class={`sr-only peer ${className ?? ""}`}
      />
      <div class="w-12 h-8 rounded-full bg-toggle-bg relative transition-colors peer-checked:bg-toggle-checked peer-checked:[&>div]:translate-x-4">
        <div class="absolute top-0.5 left-0.5 h-7 w-7 rounded-full bg-toggle-thumb shadow transform transition-transform">
        </div>
      </div>
    </label>
  );
}
