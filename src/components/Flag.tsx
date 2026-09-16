import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { FLAG_CODES } from "@assets/flags/codes.ts";

const KNOWN_FLAG_CODES = new Set(FLAG_CODES);

// Subdivisions without a flag of their own fall back to the parent country.
export function resolveFlagCode(code: string): string | undefined {
  if (KNOWN_FLAG_CODES.has(code)) return code;
  const parentCode = code.split("-")[0];
  return KNOWN_FLAG_CODES.has(parentCode) ? parentCode : undefined;
}

export default function Flag(props: { code: string }) {
  const [settings] = useSettingsStore();

  const resolvedCode = () => resolveFlagCode(props.code);
  const visible = () =>
    resolvedCode() !== undefined && settings.flagDisplay !== "none";
  const grayscale = () => settings.flagDisplay === "mono";

  return (
    <span
      class={`w-7 h-5 rounded-sm shrink-0 ${
        visible()
          ? `ring-1 ring-inset ring-black/15 dark:ring-slate-950 fi fi-${resolvedCode()}`
          : ""
      }${grayscale() ? " grayscale" : ""}`}
      aria-hidden="true"
    />
  );
}
