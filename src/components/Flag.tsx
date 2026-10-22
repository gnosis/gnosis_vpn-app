import { useSettingsStore } from "@src/stores/settingsStore.ts";
import { FLAG_CODES } from "@assets/flags/codes.ts";

const KNOWN_FLAG_CODES = new Set(FLAG_CODES);

const sizeClass = {
  sm: "w-6 h-4 rounded-sm",
  md: "w-7 h-5 rounded-sm",
  lg: "w-12 h-[34px] rounded-md",
} as const;

export default function Flag(props: {
  code: string;
  size?: keyof typeof sizeClass;
  /**
   * How much of its color the flag keeps, 0–1: 0 is the grey, faded flag of
   * a destination we are not connected to, 1 full color. Unset keeps the
   * plain look used in lists.
   */
  color?: number;
}) {
  const [settings] = useSettingsStore();

  const visible = () =>
    KNOWN_FLAG_CODES.has(props.code) && settings.flagDisplay !== "none";
  const mono = () => settings.flagDisplay === "mono";
  const ramped = () => props.color !== undefined;
  // A mono flag stays grey at every step; only its opacity follows the ramp.
  const gray = () => (mono() ? 1 : 1 - (props.color ?? 1));
  const alpha = () => 0.55 + 0.45 * (props.color ?? 1);

  return (
    <span
      class={`${sizeClass[props.size ?? "md"]} shrink-0 ${
        visible()
          ? `ring-1 ring-inset ring-black/15 dark:ring-slate-950 fi fi-${props.code}`
          : ""
      }${mono() && !ramped() ? " grayscale" : ""}${
        ramped() ? " flag-ramp" : ""
      }`}
      style={ramped()
        ? { "--flag-gray": `${gray()}`, "--flag-alpha": `${alpha()}` }
        : undefined}
      // Decorative: the label beside it names the country.
      aria-hidden="true"
    />
  );
}
