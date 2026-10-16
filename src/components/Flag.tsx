import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { FLAG_CODES } from "@assets/flags/codes.ts";

const KNOWN_FLAG_CODES = new Set(FLAG_CODES);

export default function Flag(props: { code: string }) {
  const [settings] = useSettingsStore();

  const visible = () =>
    KNOWN_FLAG_CODES.has(props.code) && settings.flagDisplay !== "none";
  const grayscale = () => settings.flagDisplay === "mono";

  return (
    <span
      class={`w-7 h-5 rounded-sm shrink-0 ${
        visible()
          ? `ring-1 ring-inset ring-black/15 dark:ring-slate-950 fi fi-${props.code}`
          : ""
      }${grayscale() ? " grayscale" : ""}`}
      aria-hidden="true"
    />
  );
}
