import { JSX, splitProps } from "solid-js";
import checkedIconUrl from "@assets/icons/checked-box.svg";
import uncheckedIconUrl from "@assets/icons/unchecked-box.svg";

export type CheckboxProps =
  & {
    checked: boolean;
    onChange: (nextChecked: boolean) => void;
    disabled?: boolean;
    class?: string;
    title?: string;
  }
  & Omit<
    JSX.ButtonHTMLAttributes<HTMLButtonElement>,
    "type" | "checked" | "onChange"
  >;

export default function Checkbox(allProps: CheckboxProps) {
  const [props, rest] = splitProps(allProps, [
    "checked",
    "onChange",
    "disabled",
    "class",
    "title",
  ]);

  function handleToggle() {
    if (props.disabled) return;
    props.onChange(!props.checked);
  }

  return (
    <button
      type="button"
      class={`inline-flex items-center justify-center ${props.class ?? ""}`}
      aria-pressed={props.checked}
      aria-label={props.title ?? "Toggle"}
      onClick={handleToggle}
      disabled={props.disabled}
      {...rest}
    >
      <img
        src={props.checked ? checkedIconUrl : uncheckedIconUrl}
        alt={props.checked ? "Checked" : "Unchecked"}
        class="h-5 w-5"
      />
    </button>
  );
}
