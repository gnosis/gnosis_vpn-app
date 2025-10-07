import type { JSX } from "solid-js";

export default function Toggle(props: JSX.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const { class: className, ...rest } = props;

  return (
    <label class="flex items-center justify-between">
      <span>{props.label}</span>
      <input {...rest} type="checkbox" role="switch" class={`sr-only peer ${className ?? ""}`} />
      <div class="w-12 h-8 rounded-full bg-gray-200 relative transition-colors peer-checked:bg-black peer-checked:[&>div]:translate-x-4">
        <div class="absolute top-0.5 left-0.5 h-7 w-7 rounded-full bg-white shadow transform transition-transform"></div>
      </div>
    </label>
  );
}
