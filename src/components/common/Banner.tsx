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

// Variants differ in colors only; shared sizing and frosted backdrop keep stacked banners alike.
const containerClasses: Record<NonNullable<BannerProps["variant"]>, string> = {
  warning:
    "bg-orange-100/65 border border-orange-500/30 text-text-orange dark:bg-orange-950/55",
  critical:
    "bg-red-100/65 border border-red-500/30 text-text-red dark:bg-red-950/55",
  danger: "bg-red-600/75 border border-red-700/60 text-white",
  neutral: "bg-bg-surface/65 text-text-primary",
  update:
    "bg-blue-100/65 border border-blue-500/30 text-blue-700 dark:bg-[#1F2936]/55 dark:border-[#1F2936] dark:text-text-secondary",
};

export default function Banner(props: BannerProps): JSX.Element {
  const variant = () => props.variant ?? "neutral";
  // danger appears after mount and cannot be dismissed, so it must be announced.
  const role = () => (variant() === "danger" ? "alert" : undefined);
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
      role={role()}
      class={`relative rounded-lg px-3 py-1.5 text-xs flex flex-col items-start gap-2 backdrop-blur-md backdrop-saturate-150 ${
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
