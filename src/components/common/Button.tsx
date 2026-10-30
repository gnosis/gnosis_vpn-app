import {
  createSignal,
  type JSX,
  mergeProps,
  onCleanup,
  splitProps,
} from "solid-js";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "outline" | "stop" | "neutral";
  size?: "sm" | "md" | "lg" | "main";
  fullWidth?: boolean;
  disabled?: boolean;
  class?: string;
  loading?: boolean;
  children: import("solid-js").JSX.Element;
  onClick?: () => void;
}

// Default arrow cursor on buttons, as native desktop toolkits do; the focus ring only shows for keyboard focus.
const baseClasses =
  "font-bold inline-flex items-center justify-center focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 gap-2 transition-transform duration-150 ease-out select-none";

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "border border-transparent bg-accent text-accent-text focus:outline-none enabled:hover:bg-accent-hover",
  secondary:
    "border border-transparent bg-btn-secondary-bg text-btn-secondary-text focus:outline-none enabled:hover:bg-btn-secondary-hover",
  outline:
    "border border-border bg-transparent text-text-primary focus:outline-none enabled:hover:bg-darken",
  stop:
    "border border-transparent bg-btn-stop-bg text-btn-stop-text focus:outline-none enabled:hover:bg-btn-stop-hover",
  // Quiet grey for an action that gives something up without being destructive (Cancel).
  neutral:
    "border border-border bg-bg-surface-alt text-text-primary focus:outline-none enabled:hover:bg-darken",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-14 px-6 text-base rounded-2xl",
  // The main screen's primary action: desktop-sized, not touch-sized.
  main: "h-11 px-4 text-base rounded-xl",
};

export default function Button(allProps: ButtonProps): JSX.Element {
  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  onCleanup(() => {
    globalThis.clearTimeout(pressTimeout);
  });

  const playPressAnimation = () => {
    globalThis.clearTimeout(pressTimeout);
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = globalThis.setTimeout(() => setPressed(false), 160);
    });
  };

  const props = mergeProps(
    {
      variant: "primary",
      size: "md",
      fullWidth: true,
      disabled: false,
    } as const,
    allProps,
  );
  const [local, others] = splitProps(props, [
    "variant",
    "size",
    "fullWidth",
    "class",
    "children",
    "disabled",
    "onClick",
    "loading",
  ]);

  const computedClass = () =>
    [
      baseClasses,
      local.fullWidth ? "w-full" : undefined,
      variantClasses[local.variant!],
      sizeClasses[local.size!],
      pressed() ? "btn-press" : undefined,
      local.class,
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <button
      type="button"
      class={computedClass()}
      disabled={local.disabled || local.loading}
      aria-disabled={local.disabled || undefined}
      {...others}
      onPointerDown={() => playPressAnimation()}
      onClick={() => local.onClick?.()}
    >
      <div>{local.children}</div>
    </button>
  );
}
