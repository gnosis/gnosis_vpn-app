import { createSignal, type JSX, mergeProps, Show, splitProps } from "solid-js";
import Spinner from "@src/components/common/Spinner";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  class?: string;
  loading?: boolean;
  children: import("solid-js").JSX.Element;
  onClick?: () => void;
}

const baseClasses =
  "font-bold w-full inline-flex items-center justify-center focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed gap-2 hover:cursor-pointer transition-transform duration-150 ease-out select-none";

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "border border-transparent bg-black text-white hover:bg-black focus:outline-none",
  secondary:
    "border border-transparent bg-gray-800 text-white hover:bg-gray-700 focus:outline-none",
  outline:
    "border border-gray-300 text-gray-900 hover:bg-gray-100 focus:outline-none",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-14 px-6 text-base rounded-2xl",
};

const leadingOffsetClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "-ml-4 h-5 w-5 flex items-center justify-center",
  md: "-ml-6 h-5 w-5 flex items-center justify-center",
  lg: "-ml-8 h-6 w-6 flex items-center justify-center",
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
      disabled: false,
    } as const,
    allProps,
  );
  const [local, others] = splitProps(props, [
    "variant",
    "size",
    "class",
    "children",
    "disabled",
    "onClick",
    "loading",
  ]);

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
      aria-disabled={local.disabled || undefined}
      {...others}
      onPointerDown={() => playPressAnimation()}
      onClick={() => local.onClick?.()}
    >
      <div class={leadingOffsetClasses[local.size!]}>
        <Show when={local.loading}>
          <Spinner />
        </Show>
      </div>
      <div>{local.children}</div>
    </button>
  );
}
