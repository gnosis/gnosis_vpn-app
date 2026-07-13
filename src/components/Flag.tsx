import { Show } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";

export default function Flag(props: { code: string }) {
  const [settings] = useSettingsStore();

  const visible = () =>
    props.code.length > 0 && settings.flagDisplay !== "none";
  const grayscale = () => settings.flagDisplay === "mono";

  return (
    <Show when={visible()}>
      <span
        class={`fi fi-${props.code} rounded-sm shrink-0${
          grayscale() ? " grayscale" : ""
        }`}
        aria-hidden="true"
      />
    </Show>
  );
}
