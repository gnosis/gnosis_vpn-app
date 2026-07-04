export default function WarningIcon(
  props: { class?: string; size?: number; filled?: boolean },
) {
  const size = () => props.size ?? 12;

  if (props.filled) {
    // Emoji-style warning sign: amber rounded triangle, white exclamation mark.
    return (
      <svg
        width={size()}
        height={size()}
        viewBox="0 0 24 24"
        class={`shrink-0 ${props.class ?? ""}`}
        aria-hidden="true"
      >
        <path
          d="M12 2.5c.87 0 1.68.46 2.13 1.21l8.9 15.03c.94 1.58-.2 3.58-2.03 3.58H3c-1.84 0-2.97-2-2.04-3.58l8.9-15.03A2.48 2.48 0 0 1 12 2.5z"
          fill="#f59e0b"
        />
        <path
          d="M12 8.25c.62 0 1.13.5 1.13 1.13v3.5a1.13 1.13 0 0 1-2.26 0v-3.5c0-.62.5-1.13 1.13-1.13z"
          fill="#ffffff"
        />
        <circle cx="12" cy="17" r="1.25" fill="#ffffff" />
      </svg>
    );
  }

  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="currentColor"
      class={`inline mb-0.5 mr-1 shrink-0 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}
