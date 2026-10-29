import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { FLAG_CODES } from "@assets/flags/codes.ts";

const KNOWN_FLAG_CODES = new Set(FLAG_CODES);

<<<<<<< HEAD
export default function Flag(props: { code: string }) {
=======
// Subdivisions without a flag of their own fall back to the parent country.
export function resolveFlagCode(code: string): string | undefined {
  if (KNOWN_FLAG_CODES.has(code)) return code;
  const parentCode = code.split("-")[0];
  return KNOWN_FLAG_CODES.has(parentCode) ? parentCode : undefined;
}

const sizeClass = {
  sm: "w-6 h-4 rounded-sm",
  md: "w-7 h-5 rounded-sm",
  lg: "w-12 h-[34px] rounded-md",
} as const;

export default function Flag(props: {
  code: string;
  size?: keyof typeof sizeClass;
}) {
>>>>>>> 2c05a4f (feat(ui): address 626 review follow ups releasehoprdv4 (#627))
  const [settings] = useSettingsStore();

  const visible = () =>
<<<<<<< HEAD
    KNOWN_FLAG_CODES.has(props.code) && settings.flagDisplay !== "none";
  const grayscale = () => settings.flagDisplay === "mono";
=======
    resolvedCode() !== undefined && settings.flagDisplay !== "none";
  const mono = () => settings.flagDisplay === "mono";
>>>>>>> 2c05a4f (feat(ui): address 626 review follow ups releasehoprdv4 (#627))

  return (
    <span
      class={`w-7 h-5 rounded-sm shrink-0 ${
        visible()
          ? `ring-1 ring-inset ring-black/15 dark:ring-slate-950 fi fi-${props.code}`
          : ""
<<<<<<< HEAD
      }${grayscale() ? " grayscale" : ""}`}
      // Decorative: the label beside it names the country.
=======
      }${mono() ? " grayscale" : ""}`}
>>>>>>> 2c05a4f (feat(ui): address 626 review follow ups releasehoprdv4 (#627))
      aria-hidden="true"
    />
  );
}
