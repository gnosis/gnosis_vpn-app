import { createSignal, type JSX, mergeProps, splitProps } from "solid-js";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  disabled?: boolean;
  class?: string;
  loading?: boolean;
  children: import("solid-js").JSX.Element;
  onClick?: () => void;
}

const baseClasses =
  "font-bold inline-flex items-center justify-center focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed gap-2 hover:cursor-pointer transition-transform duration-150 ease-out select-none hover:bg-darken";

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "border border-transparent bg-accent text-accent-text focus:outline-none",
  secondary:
    "border border-transparent bg-btn-secondary-bg text-btn-secondary-text focus:outline-none",
  outline:
    "border border-border bg-transparent text-text-primary focus:outline-none",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-14 px-6 text-base rounded-2xl",
};

export default function Button(allProps: ButtonProps): JSX.Element {
  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  const playPressAnimation = () => {
    if (pressTimeout !== undefined) {
      globalThis.clearTimeout(pressTimeout);
    }
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
