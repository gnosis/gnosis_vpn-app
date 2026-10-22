export default function InfoCircleIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      class={`shrink-0 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  );
}
