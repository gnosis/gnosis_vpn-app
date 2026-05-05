import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export default function Toggle(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    small?: boolean;
  },
) {
  const [local, rest] = splitProps(props, ["class", "label", "small"]);

  const track = local.small
    ? "w-9 h-5 peer-checked:[&>div]:translate-x-4"
    : "w-12 h-8 peer-checked:[&>div]:translate-x-4";
  const thumb = local.small ? "h-4 w-4" : "h-7 w-7";

  return (
    <label class="flex items-center justify-between">
      <span class="text-text-primary">{local.label}</span>
      <input
        {...rest}
        type="checkbox"
        role="switch"
        class={`sr-only peer ${local.class ?? ""}`}
      />
      <div
        class={`${track} rounded-full bg-toggle-bg relative transition-colors peer-checked:bg-toggle-checked`}
      >
        <div
          class={`${thumb} absolute top-0.5 left-0.5 rounded-full bg-toggle-thumb shadow transform transition-transform`}
        >
        </div>
      </div>
    </label>
  );
}
