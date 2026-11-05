import { type JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import SettingIcon, {
  type SettingIconName,
} from "@src/components/icons/SettingIcon.tsx";

/** The small grey button at a row's end, the mock's Export / Upload. */
export const ROW_BUTTON =
  "h-6.5 shrink-0 rounded-[7px] bg-control-bg px-2.25 text-[11.5px] leading-none font-bold hover:bg-control-bg-hover hover:cursor-pointer disabled:cursor-default disabled:opacity-50";

/** Icon tile, title with an optional line below it, and a control at the end; a button when given `onClick`. */
export default function SettingsRow(props: {
  icon: SettingIconName;
  title: JSX.Element;
  description?: JSX.Element;
  children?: JSX.Element;
  onClick?: () => void;
}) {
  return (
    <Dynamic
      component={props.onClick ? "button" : "div"}
      type={props.onClick ? "button" : undefined}
      class={`flex min-h-12.5 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
        props.onClick ? "hover:bg-row-hover hover:cursor-pointer" : ""
      }`}
      onClick={props.onClick}
    >
      <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-control-bg text-text-soft">
        <SettingIcon name={props.icon} />
      </span>
      <span class="block min-w-0 flex-1 text-[13px] leading-4.5">
        {props.title}
        <Show when={props.description}>
          <small class="mt-0.5 block text-xs leading-normal text-text-subtle">
            {props.description}
          </small>
        </Show>
      </span>
      {props.children}
    </Dynamic>
  );
}
