import { type JSX, Show } from "solid-js";

export interface BannerProps {
  variant?: "warning" | "neutral";
  icon?: JSX.Element;
  // Makes the banner body clickable (rendered as a button).
  onClick?: () => void;
  // Shows the ✕ button; clicking it does not trigger onClick.
  onDismiss?: () => void;
  dismissAriaLabel?: string;
  // Optional extra row below the main content (e.g. an action button).
  actions?: JSX.Element;
  children: JSX.Element;
}

// Variants differ in colors only; sizing (padding, font, icon) is shared so
// stacked banners always line up.
const containerClasses: Record<NonNullable<BannerProps["variant"]>, string> = {
  warning: "bg-orange-500/15 border border-orange-500/30 text-orange-400",
  neutral: "bg-bg-surface text-text-primary",
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
      onClick={() => props.onClick?.()}
      class={`rounded-lg px-3 py-1.5 text-xs flex flex-col items-start gap-2 ${
        containerClasses[variant()]
      }`}
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
          <button
            type="button"
            class="hover:opacity-70 hover:cursor-pointer transition-opacity flex items-center gap-1.5"
          >
            {content()}
          </button>
        </Show>
        <Show when={props.onDismiss}>
          <button
            type="button"
            class="hover:opacity-70 hover:cursor-pointer transition-opacity"
            onClick={(event) => {
              event.stopPropagation();
              props.onDismiss?.();
            }}
            aria-label={props.dismissAriaLabel ?? "Dismiss notification"}
          >
            ✕
          </button>
        </Show>
      </div>
      {props.actions}
    </div>
  );
}
