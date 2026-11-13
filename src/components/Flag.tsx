import { Show } from "solid-js";
import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { FLAG_CODES } from "@assets/flags/codes.ts";
import NodeIcon from "./icons/NodeIcon.tsx";

const KNOWN_FLAG_CODES = new Set(FLAG_CODES);

/** The exit's icon as Settings picks it: its country flag, the node icon, or an empty box. */
export default function Flag(props: { code: string; sizeClass?: string }) {
  const [settings] = useSettingsStore();

  const sizeClass = () => props.sizeClass ?? "w-7 h-5 rounded-sm";
  const visible = () =>
    KNOWN_FLAG_CODES.has(props.code) && settings.flagDisplay !== "none";
  const grayscale = () => settings.flagDisplay === "mono";

  return (
    <Show
      when={settings.flagDisplay === "node"}
      fallback={
        <span
          class={`${sizeClass()} shrink-0 ${
            visible()
              ? `ring-1 ring-inset ring-black/15 dark:ring-slate-950 fi fi-${props.code}`
              : ""
          }${grayscale() ? " grayscale" : ""}`}
          // Decorative: the label beside it names the country.
          aria-hidden="true"
        />
      }
    >
      <span
        class={`${sizeClass()} flex shrink-0 items-center justify-center text-control-tint`}
        aria-hidden="true"
      >
        <NodeIcon class="size-full" />
      </span>
    </Show>
  );
}
