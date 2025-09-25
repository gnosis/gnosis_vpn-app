import { type JSX, mergeProps, splitProps, createSignal } from "solid-js";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  class?: string;
  children: import("solid-js").JSX.Element;
  onClick?: () => void;
}

const baseClasses =
  "font-bold w-full inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed gap-2 hover:cursor-pointer transition-transform duration-150 ease-out select-none";

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "border border-transparent dark:border-gray-300 bg-black text-white hover:bg-black focus-visible:ring-black",
  secondary: "border border-transparent bg-gray-800 text-white hover:bg-gray-700 focus-visible:ring-gray-500",
  outline:
    "border border-gray-300 text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 focus-visible:ring-gray-400",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-14 px-6 text-base rounded-2xl",
};

export default function Button(allProps: ButtonProps): JSX.Element {
  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: number | undefined;

  const playPressAnimation = () => {
    if (pressTimeout !== undefined) {
      window.clearTimeout(pressTimeout);
    }
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = window.setTimeout(() => setPressed(false), 160);
    });
  };

  const props = mergeProps(
    {
      variant: "primary",
      size: "md",
      disabled: false,
      loading: false,
    } as const,
    allProps,
  );
  const [local, others] = splitProps(props, ["variant", "size", "class", "children", "disabled", "loading", "onClick"]);

  const computedClass = () =>
    [
      baseClasses,
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
      aria-busy={local.loading || undefined}
      aria-disabled={local.disabled || local.loading || undefined}
      {...others}
      onPointerDown={() => playPressAnimation()}
      onClick={() => local.onClick?.()}
    >
      {local.children}
    </button>
  );
}
