import { FLAG_CODES } from "@assets/flags/codes.ts";

const KNOWN_FLAG_CODES = new Set(FLAG_CODES);

export default function Flag(props: { code: string; sizeClass?: string }) {
  const visible = () => KNOWN_FLAG_CODES.has(props.code);

  return (
    <span
      class={`${props.sizeClass ?? "w-7 h-5 rounded-sm"} shrink-0 ${
        visible()
          ? `ring-1 ring-inset ring-black/15 dark:ring-slate-950 fi fi-${props.code}`
          : ""
      }`}
      // Decorative: the label beside it names the country.
      aria-hidden="true"
    />
  );
}
