export default function Switch(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      class={`relative h-4.75 w-8 shrink-0 rounded-full transition-colors hover:cursor-pointer disabled:cursor-default disabled:opacity-50 ${
        props.checked ? "bg-control-tint" : "bg-control-bg"
      }`}
      onClick={() => props.onChange?.(!props.checked)}
    >
      <span
        class={`absolute top-0.5 left-0.5 size-3.75 rounded-full bg-white transition-transform duration-150 ${
          props.checked ? "translate-x-3.25" : ""
        }`}
      />
    </button>
  );
}
