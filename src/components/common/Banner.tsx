import { type JSX, Show } from "solid-js";

export interface BannerProps {
  variant?: "warning" | "critical" | "danger" | "neutral" | "update";
  icon?: JSX.Element;
  onClick?: () => void;
  onDismiss?: () => void;
  dismissAriaLabel?: string;
  actions?: JSX.Element;
  children: JSX.Element;
}

// Variants differ in colors only; sizing (padding, font, icon) is shared so
// stacked banners always line up.
const containerClasses: Record<NonNullable<BannerProps["variant"]>, string> = {
  warning: "bg-orange-500/15 border border-orange-500/30 text-orange-400",
  critical: "bg-red-500/15 border border-red-500/30 text-red-400",
  danger: "bg-red-600/85 border border-red-700 text-white",
  neutral: "bg-bg-surface text-text-primary",
  update:
    "bg-blue-500/10 border border-blue-500/40 text-blue-700 dark:bg-[#1F2936]/50 dark:border-[#1F2936] dark:text-text-secondary",
};

export default function Banner(props: BannerProps): JSX.Element {
  const variant = () => props.variant ?? "neutral";
  const content = () => (
    <>
      <Show when={props.icon}>
        <span class="shrink-0 flex items-center [&_svg]:size-3.5">
          {props.icon}
        </span>
      </Show>
      {props.children}
    </>
  );

  return (
    <div
      class={`relative rounded-lg px-3 py-1.5 text-xs flex flex-col items-start gap-2 ${
        props.onClick ? "hover:bg-darken dark:hover:bg-lighten" : ""
      } ${containerClasses[variant()]}`}
    >
      <div class="w-full flex items-center justify-between">
        <Show
          when={props.onClick}
          fallback={
            <div class="flex items-center gap-1.5">
              {content()}
            </div>
          }
        >
          {/* A sibling of the dismiss button, not its parent; ::after stretches the target over the banner. */}
          <button
            type="button"
            class="flex items-center gap-1.5 text-left cursor-pointer after:absolute after:inset-0 after:rounded-lg"
            onClick={() => props.onClick?.()}
          >
            {content()}
          </button>
        </Show>
        <Show when={props.onDismiss}>
          <button
            type="button"
            class="relative z-10 size-5 -my-0.5 -mr-1.5 flex items-center justify-center rounded-full hover:cursor-pointer hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
            onClick={() => props.onDismiss?.()}
            aria-label={props.dismissAriaLabel ?? "Dismiss notification"}
          >
            ✕
          </button>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="relative z-10">{props.actions}</div>
      </Show>
    </div>
  );
}
