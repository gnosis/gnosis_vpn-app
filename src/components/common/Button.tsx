import { type JSX, splitProps, mergeProps, Show } from 'solid-js';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  class?: string;
  children: import('solid-js').JSX.Element;
  onClick?: () => void;
}

const baseClasses =
  'inline-flex items-center justify-center rounded-md font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed gap-2 hover:cursor-pointer';

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'border dart:border-gray-300 bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
  secondary:
    'border border-transparent bg-gray-800 text-white hover:bg-gray-700 focus-visible:ring-gray-500',
  outline:
    'border border-gray-300 text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 focus-visible:ring-gray-400',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export default function Button(allProps: ButtonProps): JSX.Element {
  const props = mergeProps(
    {
      variant: 'primary',
      size: 'md',
      disabled: false,
      loading: false,
    } as const,
    allProps
  );
  const [local, others] = splitProps(props, [
    'variant',
    'size',
    'class',
    'children',
    'disabled',
    'loading',
    'onClick',
  ]);

  const computedClass = () =>
    [
      baseClasses,
      variantClasses[local.variant!],
      sizeClasses[local.size!],
      local.class,
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <button
      type="button"
      class={computedClass()}
      disabled={local.disabled || local.loading}
      aria-busy={local.loading || undefined}
      aria-disabled={local.disabled || local.loading || undefined}
      {...others}
      onClick={local.onClick}
    >
      <Show when={local.loading}>
        <svg
          class="animate-spin -ml-1 mr-2 h-5 w-5 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          ></path>
        </svg>
      </Show>
      {local.children}
    </button>
  );
}
