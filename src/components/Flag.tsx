import { useSettingsStore } from "@src/stores/settingsStore.ts";
import flagCountries from "flag-icons/country.json";

const KNOWN_FLAG_CODES = new Set(flagCountries.map((country) => country.code));

// gb-sct etc. have art; other ISO 3166-2 subdivisions don't, so fall back to
// the parent country code (the part before the hyphen) when the exact code is missing.
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
      class={`w-7 h-5 rounded-sm shrink-0${
        visible()
          ? ` ring-1 ring-inset ring-slate-950 fi fi-${resolvedCode()}`
          : ""
      }${grayscale() ? " grayscale" : ""}`}
      aria-hidden="true"
    />
  );
}
